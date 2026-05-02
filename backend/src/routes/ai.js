const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const AI_PROVIDER = String(process.env.AI_PROVIDER || 'groq').toLowerCase();
const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || process.env.XAI_CACHE_MS || 10 * 60 * 1000);

const PROVIDERS = {
  groq: {
    name: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
  },
  xai: {
    name: 'xAI',
    apiKeyEnv: 'XAI_API_KEY',
    model: process.env.XAI_MODEL || 'grok-4-fast-non-reasoning',
    baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
  },
};

const providerConfig = PROVIDERS[AI_PROVIDER] || PROVIDERS.groq;
const AI_MODEL = providerConfig.model;
const AI_BASE_URL = providerConfig.baseUrl;
const AI_API_KEY = process.env[providerConfig.apiKeyEnv];

let analysisCache = null;
let analysisPromise = null;

function toNumber(value) {
  return Number(value || 0);
}

function clampNumber(value, fallback, min = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function normalizePriority(value, fallback = 'medium') {
  return ['low', 'medium', 'high', 'critical'].includes(value) ? value : fallback;
}

function normalizeSeverity(value, fallback = 'medium') {
  return ['low', 'medium', 'high'].includes(value) ? value : fallback;
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

function priorityRank(value) {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[value] || 0;
}

function mapProviderFailure(error) {
  if (!error) {
    return {
      reason: 'unknown',
      message: `${providerConfig.name} request did not complete.`,
    };
  }

  if (!AI_API_KEY) {
    return {
      reason: 'missing_api_key',
      message: `${providerConfig.apiKeyEnv} is not set on the backend service.`,
    };
  }

  if (error.name === 'AbortError') {
    return {
      reason: 'timeout',
      message: `The ${providerConfig.name} request timed out.`,
    };
  }

  const status = Number(error.status || 0);
  if (status === 401) {
    return {
      reason: 'unauthorized',
      message: `The ${providerConfig.name} API key was rejected with 401 Unauthorized.`,
    };
  }
  if (status === 403) {
    return {
      reason: 'forbidden',
      message: `The ${providerConfig.name} request was forbidden by the provider.`,
    };
  }
  if (status === 404) {
    return {
      reason: 'not_found',
      message: `The ${providerConfig.name} endpoint or model could not be found.`,
    };
  }
  if (status === 429) {
    return {
      reason: 'rate_limited',
      message: `The ${providerConfig.name} account or key is currently rate limited. The free-tier project limit may have been reached, or the request may still be too large for the current token budget.`,
    };
  }
  if (status >= 500) {
    return {
      reason: 'provider_error',
      message: `${providerConfig.name} returned server error ${status}.`,
    };
  }

  const message = String(error.message || '').trim();
  if (message) {
    return {
      reason: 'request_failed',
      message,
    };
  }

  return {
    reason: 'request_failed',
    message: `The ${providerConfig.name} request failed for an unknown reason.`,
  };
}

async function callProviderJson(messages) {
  if (!AI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: false,
        temperature: 0.2,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `${providerConfig.name} returned ${response.status}`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }

    return normalizeJsonObject(payload?.choices?.[0]?.message?.content);
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalWarehouseRisks(products, purchaseMap) {
  const toDays = (ms) => Math.floor(ms / (1000 * 60 * 60 * 24));
  const now = new Date();

  return products.map((p) => {
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
        : `Shelf life ${shelfLifeDays} days; ${daysToExpiry} days left (${percentUsed}% used)`;
    const stockReason =
      p.qtyOnHand <= p.lowStockThreshold
        ? `Low stock: ${p.qtyOnHand}/${p.lowStockThreshold}`
        : 'Stock healthy';

    return {
      itemId: p.productId.toString(),
      itemName: p.itemName,
      riskLevel,
      reason: `${ageReason}; ${stockReason}`,
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
}

function buildLocalReorderSuggestions(products) {
  return products
    .filter((p) => p.deletedAt === null && p.qtyOnHand <= p.lowStockThreshold)
    .map((p) => {
      const suggestedQty = Math.max(p.lowStockThreshold * 2, 10);
      return {
        itemId: p.productId.toString(),
        itemName: p.itemName,
        currentQty: p.qtyOnHand,
        suggestedQty,
        estimatedCost: toNumber(p.unitPrice) * suggestedQty,
      };
    });
}

function buildLocalFraudAlerts(clientOrders) {
  const now = Date.now();
  return clientOrders
    .filter((order) => {
      const ageDays = Math.floor((now - new Date(order.createdAt || order.orderDate || now).getTime()) / 86400000);
      return order.paymentStatus === 'FAILED' || (toNumber(order.total) >= 100000 && order.paymentStatus === 'PENDING' && ageDays >= 7);
    })
    .slice(0, 5)
    .map((order) => ({
      id: `order-${order.clientOrderId}`,
      orderId: String(order.clientOrderId),
      orderNumber: order.orderNumber,
      severity: order.paymentStatus === 'FAILED' ? 'high' : 'medium',
      message:
        order.paymentStatus === 'FAILED'
          ? 'AI flags this order for payment follow-up because payment verification failed.'
          : 'AI flags this high-value order because payment is still pending after a week.',
      timestamp: new Date().toISOString(),
    }));
}

function buildLocalLogisticsSnapshot(deliveries) {
  const active = deliveries.filter((d) => ['PENDING', 'IN_TRANSIT'].includes(d.status));
  const completed = deliveries.filter((d) => d.status === 'DELIVERED');
  const onTime = completed.filter((d) => !d.eta || !d.receivedAt || new Date(d.receivedAt) <= new Date(d.eta));
  const onTimeRate = completed.length ? Math.round((onTime.length / completed.length) * 100) : 100;
  const today = new Date().toISOString().slice(0, 10);
  const stopsToday = deliveries.filter((d) => d.eta && new Date(d.eta).toISOString().slice(0, 10) === today).length;

  return {
    activeRoutes: active.length,
    stopsToday,
    onTimeRate,
    recommendation: active.length
      ? 'AI recommends monitoring active dispatches with the nearest ETA first.'
      : 'No active dispatches need routing intervention right now.',
    dispatches: active.slice(0, 3).map((d, index) => ({
      route: `${d.drNumber || `Route ${index + 1}`} - ${d.clientOrder?.client?.clientName || 'Client'}`,
      status: d.status === 'IN_TRANSIT' ? 'On Route' : 'Pending',
      note: d.eta ? `ETA ${new Date(d.eta).toLocaleDateString('en-PH')}` : 'ETA not scheduled',
    })),
  };
}

function buildLocalAnalysis(snapshot) {
  const { products, purchases, clientOrders, deliveries } = snapshot;
  const purchaseMap = new Map(purchases.map((p) => [p.productId, p._max.date]));
  const warehouseRisks = buildLocalWarehouseRisks(products, purchaseMap);
  const reorderSuggestions = buildLocalReorderSuggestions(products);
  const fraudAlerts = buildLocalFraudAlerts(clientOrders);
  const logisticsSnapshot = buildLocalLogisticsSnapshot(deliveries);
  const critical = warehouseRisks.filter((risk) => risk.riskLevel === 'critical').length;
  const high = warehouseRisks.filter((risk) => risk.riskLevel === 'high').length;
  const reorderTotal = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);

  return {
    enabled: false,
    provider: 'local-rules',
    model: AI_MODEL,
    generatedAt: new Date().toISOString(),
    availabilityReason: AI_API_KEY ? 'fallback_after_error' : 'missing_api_key',
    availabilityMessage: AI_API_KEY
      ? `${providerConfig.name} analysis is temporarily unavailable, so local operational rules are being used.`
      : `${providerConfig.apiKeyEnv} is not configured on the backend service.`,
    summary: AI_API_KEY
      ? `${providerConfig.name} analysis is temporarily unavailable, so local operational rules are being used.`
      : `${providerConfig.name} is not configured yet. Add ${providerConfig.apiKeyEnv} on Railway to enable AI-written analysis.`,
    recommendations: [
      {
        title: critical || high ? 'Prioritize stock risk' : 'Inventory stable',
        message: `${critical} critical and ${high} high-risk inventory items are currently detected.`,
        priority: critical ? 'critical' : high ? 'high' : 'low',
        action: critical || high ? 'Review risk alerts and reorder urgent items.' : 'Keep monitoring normal movement.',
      },
      {
        title: 'Purchasing budget',
        message: `Current reorder estimate is PHP ${Math.round(reorderTotal).toLocaleString('en-PH')}.`,
        priority: reorderTotal ? 'medium' : 'low',
        action: reorderTotal ? 'Prepare purchase orders from the AI reorder list.' : 'No purchase action needed now.',
      },
      {
        title: 'Dispatch watch',
        message: `${logisticsSnapshot.activeRoutes} active routes with ${logisticsSnapshot.onTimeRate}% on-time performance.`,
        priority: logisticsSnapshot.onTimeRate < 85 ? 'high' : 'low',
        action: logisticsSnapshot.recommendation,
      },
    ],
    warehouseRisks,
    reorderSuggestions,
    fraudAlerts,
    logisticsSnapshot,
  };
}

async function buildSnapshot() {
  const [products, purchases, clientOrders, deliveries] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { qtyOnHand: 'asc' }, { itemName: 'asc' }],
      take: 100,
    }),
    prisma.stockTransaction.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE' },
      _max: { date: true },
    }),
    prisma.clientOrder.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        client: true,
        project: true,
        items: { include: { product: true } },
      },
    }),
    prisma.delivery.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        assignedDeliveryGuy: true,
        clientOrder: {
          include: {
            client: true,
            project: true,
            items: { include: { product: true } },
          },
        },
      },
    }),
  ]);

  return { products, purchases, clientOrders, deliveries };
}

function compactSnapshot(snapshot, fallback) {
  const rankedWarehouseRisks = [...fallback.warehouseRisks]
    .sort((a, b) => priorityRank(b.riskLevel) - priorityRank(a.riskLevel))
    .slice(0, 12)
    .map((risk) => ({
      itemId: risk.itemId,
      itemName: risk.itemName,
      riskLevel: risk.riskLevel,
      reason: risk.reason,
      recommendedAction: risk.recommendedAction,
      daysToExpiry: risk.daysToExpiry,
    }));

  const rankedReorders = [...fallback.reorderSuggestions]
    .sort((a, b) => b.estimatedCost - a.estimatedCost)
    .slice(0, 10);

  const rankedOrders = snapshot.clientOrders
    .slice()
    .sort((a, b) => toNumber(b.total) - toNumber(a.total))
    .slice(0, 10)
    .map((order) => ({
      id: order.clientOrderId,
      orderNumber: order.orderNumber,
      client: order.client?.clientName,
      project: order.project?.projectName,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: toNumber(order.total),
      itemCount: order.items.length,
    }));

  const activeDeliveries = snapshot.deliveries
    .filter((delivery) => ['PENDING', 'IN_TRANSIT'].includes(delivery.status))
    .slice(0, 8)
    .map((delivery) => ({
      id: delivery.deliveryId,
      drNumber: delivery.drNumber,
      client: delivery.clientOrder?.client?.clientName,
      project: delivery.clientOrder?.project?.projectName,
      driver: delivery.assignedDeliveryGuy?.fullName,
      status: delivery.status,
      eta: delivery.eta,
      itemsCount: delivery.itemsCount,
    }));

  const inventorySummary = {
    totalItems: snapshot.products.length,
    zeroStock: snapshot.products.filter((p) => p.qtyOnHand === 0).length,
    lowStock: snapshot.products.filter((p) => p.qtyOnHand <= p.lowStockThreshold).length,
    totalInventoryValue: Math.round(
      snapshot.products.reduce((sum, p) => sum + toNumber(p.unitPrice) * toNumber(p.qtyOnHand), 0),
    ),
  };

  return {
    inventorySummary,
    topWarehouseRisks: rankedWarehouseRisks,
    topReorderSuggestions: rankedReorders,
    topOrders: rankedOrders,
    activeDeliveries,
    localSignals: {
      riskCount: fallback.warehouseRisks.filter((risk) => risk.riskLevel !== 'low').length,
      reorderCount: fallback.reorderSuggestions.length,
      poAlertCount: fallback.fraudAlerts.length,
      activeRoutes: fallback.logisticsSnapshot.activeRoutes,
      onTimeRate: fallback.logisticsSnapshot.onTimeRate,
      reorderEstimate: Math.round(
        fallback.reorderSuggestions.reduce((sum, item) => sum + toNumber(item.estimatedCost), 0),
      ),
    },
  };
}

function sanitizeAnalysis(ai, fallback) {
  const source = ai && typeof ai === 'object' ? ai : {};
  const generatedAt = new Date().toISOString();
  const recommendations = Array.isArray(source.recommendations) && source.recommendations.length
    ? source.recommendations.slice(0, 3).map((item, index) => ({
        title: String(item.title || `Recommendation ${index + 1}`),
        message: String(item.message || fallback.recommendations[index]?.message || ''),
        priority: normalizePriority(item.priority, fallback.recommendations[index]?.priority || 'medium'),
        action: String(item.action || fallback.recommendations[index]?.action || 'Review with operations.'),
      }))
    : fallback.recommendations;

  const warehouseRisks = Array.isArray(source.warehouseRisks) && source.warehouseRisks.length
    ? source.warehouseRisks.slice(0, 25).map((item, index) => {
        const fallbackItem = fallback.warehouseRisks[index] || fallback.warehouseRisks[0];
        return {
          itemId: String(item.itemId || fallbackItem?.itemId || index + 1),
          itemName: String(item.itemName || fallbackItem?.itemName || 'Inventory item'),
          riskLevel: normalizePriority(item.riskLevel, fallbackItem?.riskLevel || 'medium'),
          reason: String(item.reason || fallbackItem?.reason || 'AI flagged this item for review.'),
          recommendedAction: String(item.recommendedAction || fallbackItem?.recommendedAction || 'Review stock movement and purchasing plan.'),
          shelfLifeDays: clampNumber(item.shelfLifeDays, fallbackItem?.shelfLifeDays || 0),
          daysInStock: clampNumber(item.daysInStock, fallbackItem?.daysInStock || 0),
          daysToExpiry: Number.isFinite(Number(item.daysToExpiry)) ? Number(item.daysToExpiry) : fallbackItem?.daysToExpiry,
        };
      })
    : fallback.warehouseRisks;

  const reorderSuggestions = Array.isArray(source.reorderSuggestions) && source.reorderSuggestions.length
    ? source.reorderSuggestions.slice(0, 20).map((item, index) => {
        const fallbackItem = fallback.reorderSuggestions[index] || fallback.reorderSuggestions[0];
        const suggestedQty = clampNumber(item.suggestedQty, fallbackItem?.suggestedQty || 10, 1);
        return {
          itemId: String(item.itemId || fallbackItem?.itemId || index + 1),
          itemName: String(item.itemName || fallbackItem?.itemName || 'Inventory item'),
          currentQty: clampNumber(item.currentQty, fallbackItem?.currentQty || 0),
          suggestedQty,
          estimatedCost: clampNumber(item.estimatedCost, fallbackItem?.estimatedCost || 0),
        };
      })
    : fallback.reorderSuggestions;

  const fraudAlerts = Array.isArray(source.fraudAlerts)
    ? source.fraudAlerts.slice(0, 10).map((item, index) => ({
        id: String(item.id || `ai-alert-${index + 1}`),
        orderId: String(item.orderId || ''),
        orderNumber: String(item.orderNumber || 'Order review'),
        severity: normalizeSeverity(item.severity),
        message: String(item.message || 'AI recommends reviewing this order or purchase document.'),
        timestamp: item.timestamp ? new Date(item.timestamp).toISOString() : generatedAt,
      }))
    : fallback.fraudAlerts;

  const rawLogistics = source.logisticsSnapshot || {};
  const logisticsSnapshot = {
    activeRoutes: clampNumber(rawLogistics.activeRoutes, fallback.logisticsSnapshot.activeRoutes),
    stopsToday: clampNumber(rawLogistics.stopsToday, fallback.logisticsSnapshot.stopsToday),
    onTimeRate: Math.min(100, clampNumber(rawLogistics.onTimeRate, fallback.logisticsSnapshot.onTimeRate)),
    recommendation: String(rawLogistics.recommendation || fallback.logisticsSnapshot.recommendation),
    dispatches: Array.isArray(rawLogistics.dispatches) && rawLogistics.dispatches.length
      ? rawLogistics.dispatches.slice(0, 5).map((item, index) => ({
          route: String(item.route || `Route ${index + 1}`),
          status: String(item.status || 'Watch'),
          note: String(item.note || 'AI recommends monitoring this dispatch.'),
        }))
      : fallback.logisticsSnapshot.dispatches,
  };

  return {
    enabled: Boolean(ai),
    provider: ai ? AI_PROVIDER : fallback.provider,
    model: AI_MODEL,
    generatedAt,
    availabilityReason: ai ? 'available' : fallback.availabilityReason,
    availabilityMessage: ai ? `${providerConfig.name} analysis is available.` : fallback.availabilityMessage,
    summary: String(source.summary || fallback.summary),
    recommendations,
    warehouseRisks,
    reorderSuggestions,
    fraudAlerts,
    logisticsSnapshot,
  };
}

async function generateAiAnalysis(force = false) {
  if (!force && analysisCache && Date.now() - analysisCache.createdAt < AI_CACHE_MS) {
    return analysisCache.data;
  }

  if (analysisPromise) return analysisPromise;

  analysisPromise = (async () => {
    const snapshot = await buildSnapshot();
    const fallback = buildLocalAnalysis(snapshot);
    let ai = null;
    let failure = null;

    try {
      ai = await callProviderJson([
        {
          role: 'system',
          content:
            'You are the AI operations analyst for Impex Engineering. Return only valid JSON. Analyze inventory, reorder, purchase-order/payment risk, and logistics. Keep outputs concise, actionable, and based only on the provided summarized data.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task:
              'Generate every widget on the AI Insights page. Use this exact schema: {summary:string,recommendations:[{title:string,message:string,priority:"low"|"medium"|"high"|"critical",action:string}],warehouseRisks:[{itemId:string,itemName:string,riskLevel:"low"|"medium"|"high"|"critical",reason:string,recommendedAction:string,shelfLifeDays:number,daysInStock:number,daysToExpiry:number}],reorderSuggestions:[{itemId:string,itemName:string,currentQty:number,suggestedQty:number,estimatedCost:number}],fraudAlerts:[{id:string,orderId:string,orderNumber:string,severity:"low"|"medium"|"high",message:string,timestamp:string}],logisticsSnapshot:{activeRoutes:number,stopsToday:number,onTimeRate:number,recommendation:string,dispatches:[{route:string,status:string,note:string}]}}',
            currency: 'PHP',
            snapshot: compactSnapshot(snapshot, fallback),
          }),
        },
      ]);
    } catch (err) {
      failure = mapProviderFailure(err);
      console.error(`${providerConfig.name} analysis failed:`, err.message || err);
    }

    const data = sanitizeAnalysis(ai, fallback);
    if (!ai && failure) {
      data.availabilityReason = failure.reason;
      data.availabilityMessage = failure.message;
      data.summary = `${fallback.summary} Reason: ${failure.message}`;
    }
    analysisCache = { createdAt: Date.now(), data };
    analysisPromise = null;
    return data;
  })();

  try {
    return await analysisPromise;
  } catch (err) {
    analysisPromise = null;
    throw err;
  }
}

router.get('/analysis', async (_req, res, next) => {
  try {
    res.json(await generateAiAnalysis(false));
  } catch (err) {
    next(err);
  }
});

router.get('/summary', async (_req, res, next) => {
  try {
    const analysis = await generateAiAnalysis(false);
    res.json({
      enabled: analysis.enabled,
      provider: analysis.provider,
      model: analysis.model,
      generatedAt: analysis.generatedAt,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/warehouse-risks', async (_req, res, next) => {
  try {
    const analysis = await generateAiAnalysis(false);
    res.json(analysis.warehouseRisks);
  } catch (err) {
    next(err);
  }
});

router.get('/reorder-suggestions', async (_req, res, next) => {
  try {
    const analysis = await generateAiAnalysis(false);
    res.json(analysis.reorderSuggestions);
  } catch (err) {
    next(err);
  }
});

router.get('/fraud-alerts', async (_req, res, next) => {
  try {
    const analysis = await generateAiAnalysis(false);
    res.json(analysis.fraudAlerts);
  } catch (err) {
    next(err);
  }
});

router.get('/logistics-snapshot', async (_req, res, next) => {
  try {
    const analysis = await generateAiAnalysis(false);
    res.json(analysis.logisticsSnapshot);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (_req, res, next) => {
  try {
    analysisCache = null;
    const analysis = await generateAiAnalysis(true);
    await prisma.auditLog.create({
      data: {
        userId: _req.user?.userId,
        action: 'TEST',
        target: 'AI',
        details: `Refreshed full AI insights using ${analysis.provider}:${analysis.model}`,
      },
    });
    const lead = analysis.recommendations?.[0];
    if (lead) {
      await prisma.notification.create({
        data: {
          userId: _req.user?.userId,
          type: 'AI_ALERT',
          title: lead.title.slice(0, 150),
          message: lead.message || analysis.summary,
          link: '/admin/ai-insights',
        },
      });
    }
    res.json(analysis);
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
