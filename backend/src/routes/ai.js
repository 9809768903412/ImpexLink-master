const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-fast-non-reasoning';
const XAI_BASE_URL = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
const XAI_CACHE_MS = Number(process.env.XAI_CACHE_MS || 10 * 60 * 1000);

let summaryCache = null;

function toNumber(value) {
  return Number(value || 0);
}

function normalizeJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callXaiJson(messages) {
  if (!process.env.XAI_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 700,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `xAI returned ${response.status}`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }

    const content = payload?.choices?.[0]?.message?.content;
    return normalizeJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalSummary(products) {
  const risky = products.filter((p) => p.qtyOnHand <= p.lowStockThreshold);
  const critical = risky.filter((p) => p.qtyOnHand === 0);
  const estimatedReorderCost = risky.reduce(
    (sum, p) => sum + toNumber(p.unitPrice) * Math.max(p.lowStockThreshold * 2, 10),
    0
  );

  return {
    enabled: false,
    provider: 'local-rules',
    model: XAI_MODEL,
    generatedAt: new Date().toISOString(),
    summary: process.env.XAI_API_KEY
      ? 'Grok analysis is temporarily unavailable, so local stock rules are being used.'
      : 'Grok is not configured yet. Add XAI_API_KEY on Railway to enable AI-written analysis.',
    recommendations: [
      {
        title: critical.length ? 'Resolve zero-stock items' : 'Review low stock',
        message: critical.length
          ? `${critical.length} items are at zero stock and should be prioritized for purchase.`
          : `${risky.length} items are at or below their reorder threshold.`,
        priority: critical.length ? 'critical' : risky.length ? 'medium' : 'low',
        action: risky.length ? 'Create purchase orders for the suggested reorder list.' : 'No immediate action needed.',
      },
      {
        title: 'Budget estimate',
        message: `Current reorder estimate is PHP ${Math.round(estimatedReorderCost).toLocaleString('en-PH')}.`,
        priority: estimatedReorderCost > 0 ? 'medium' : 'low',
        action: 'Use this amount as the first purchasing budget checkpoint.',
      },
    ],
  };
}

async function generateAiSummary(force = false) {
  if (!force && summaryCache && Date.now() - summaryCache.createdAt < XAI_CACHE_MS) {
    return summaryCache.data;
  }

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ status: 'asc' }, { qtyOnHand: 'asc' }, { itemName: 'asc' }],
    take: 80,
    select: {
      productId: true,
      itemName: true,
      unit: true,
      unitPrice: true,
      qtyOnHand: true,
      lowStockThreshold: true,
      status: true,
      shelfLifeDays: true,
    },
  });

  const localSummary = buildLocalSummary(products);
  const compactProducts = products.map((p) => ({
    id: p.productId,
    name: p.itemName,
    unit: p.unit,
    price: toNumber(p.unitPrice),
    qty: p.qtyOnHand,
    lowStockThreshold: p.lowStockThreshold,
    status: p.status,
    shelfLifeDays: p.shelfLifeDays,
  }));

  let aiSummary = null;
  try {
    aiSummary = await callXaiJson([
      {
        role: 'system',
        content:
          'You are an operations analyst for Impex Engineering. Return only valid JSON. Keep advice practical, concise, and purchasing-focused.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task:
            'Analyze this inventory snapshot. Return JSON with summary and 3 recommendations. Schema: {summary:string,recommendations:[{title:string,message:string,priority:"low"|"medium"|"high"|"critical",action:string}]}',
          currency: 'PHP',
          products: compactProducts,
        }),
      },
    ]);
  } catch (err) {
    console.error('xAI summary failed:', err.message || err);
  }

  const data = aiSummary
    ? {
        enabled: true,
        provider: 'xai',
        model: XAI_MODEL,
        generatedAt: new Date().toISOString(),
        summary: String(aiSummary.summary || localSummary.summary),
        recommendations: Array.isArray(aiSummary.recommendations) && aiSummary.recommendations.length
          ? aiSummary.recommendations.slice(0, 3).map((item, index) => ({
              title: String(item.title || `Recommendation ${index + 1}`),
              message: String(item.message || ''),
              priority: ['low', 'medium', 'high', 'critical'].includes(item.priority) ? item.priority : 'medium',
              action: String(item.action || 'Review this item with the operations team.'),
            }))
          : localSummary.recommendations,
      }
    : localSummary;

  summaryCache = { createdAt: Date.now(), data };
  return data;
}

router.get('/warehouse-risks', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({ where: { deletedAt: null } });
    const purchases = await prisma.stockTransaction.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE' },
      _max: { date: true },
    });
    const purchaseMap = new Map(
      purchases.map((p) => [p.productId, p._max.date])
    );

    const toDays = (ms) => Math.floor(ms / (1000 * 60 * 60 * 24));
    const now = new Date();

    const risks = products.map((p) => {
      const lastPurchase = purchaseMap.get(p.productId) || p.createdAt || now;
      const daysInStock = Math.max(0, toDays(now.getTime() - new Date(lastPurchase).getTime()));
      const shelfLifeDays = p.shelfLifeDays || 180;
      const daysToExpiry = shelfLifeDays - daysInStock;
      const percentUsed = shelfLifeDays > 0 ? Math.min(100, Math.round((daysInStock / shelfLifeDays) * 100)) : 0;

      const stockRisk =
        p.qtyOnHand === 0
          ? 'critical'
          : p.qtyOnHand <= Math.max(1, Math.floor(p.lowStockThreshold * 0.2))
          ? 'high'
          : p.qtyOnHand <= p.lowStockThreshold
          ? 'medium'
          : 'low';

      const ageRisk =
        daysToExpiry <= 0
          ? 'critical'
          : daysToExpiry <= 10
          ? 'high'
          : daysToExpiry <= 30
          ? 'medium'
          : 'low';

      const riskOrder = ['low', 'medium', 'high', 'critical'];
      const riskLevel =
        riskOrder.indexOf(ageRisk) >= riskOrder.indexOf(stockRisk) ? ageRisk : stockRisk;

      const ageReason =
        daysToExpiry <= 0
          ? `Past shelf life by ${Math.abs(daysToExpiry)} days`
          : `Shelf life ${shelfLifeDays} days • ${daysToExpiry} days left (${percentUsed}% used)`;
      const stockReason =
        p.qtyOnHand <= p.lowStockThreshold
          ? `Low stock: ${p.qtyOnHand}/${p.lowStockThreshold}`
          : 'Stock healthy';

      return {
        itemId: p.productId.toString(),
        itemName: p.itemName,
        riskLevel,
        reason: `${ageReason} • ${stockReason}`,
        recommendedAction:
          riskLevel === 'critical'
            ? 'Prioritize usage or reorder immediately'
            : riskLevel === 'high'
            ? 'Use soon and plan replenishment'
            : 'Monitor stock age',
        shelfLifeDays,
        daysInStock,
        daysToExpiry,
      };
    });
    res.json(risks);
  } catch (err) {
    next(err);
  }
});

router.get('/reorder-suggestions', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany();
    const suggestions = products
      .filter((p) => p.qtyOnHand <= p.lowStockThreshold)
      .map((p) => ({
        itemId: p.productId.toString(),
        itemName: p.itemName,
        currentQty: p.qtyOnHand,
        suggestedQty: Math.max(p.lowStockThreshold * 2, 10),
        estimatedCost: Number(p.unitPrice) * Math.max(p.lowStockThreshold * 2, 10),
      }));
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

router.get('/fraud-alerts', async (_req, res, next) => {
  try {
    const alerts = [];
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (_req, res, next) => {
  try {
    const summary = await generateAiSummary(false);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (_req, res, next) => {
  try {
    summaryCache = null;
    const summary = await generateAiSummary(true);
    await prisma.auditLog.create({
      data: {
        userId: _req.user?.userId,
        action: 'TEST',
        target: 'AI',
        details: `Refreshed AI insights using ${summary.provider}:${summary.model}`,
      },
    });
    const lead = summary.recommendations?.[0];
    if (lead) {
      await prisma.notification.create({
        data: {
          userId: _req.user?.userId,
          type: 'AI_ALERT',
          title: lead.title.slice(0, 150),
          message: lead.message || summary.summary,
          link: '/admin/ai-insights',
        },
      });
    }
    res.json(summary);
  } catch (err) {
    try {
      await prisma.auditLog.create({
        data: {
          userId: _req.user?.userId,
          action: 'TEST',
          target: 'AI',
          details: `AI refresh failed: ${err.message || err}`,
        },
      });
    } catch {
      // ignore audit failures
    }
    next(err);
  }
});

module.exports = router;
