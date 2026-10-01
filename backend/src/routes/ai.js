const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');
const { resolveShelfLifeDays } = require('../utils/shelfLife');
const { findThortexProduct, matchesSource, parseInsightFilters, buildUsageTrends, buildLogisticsSnapshot, lockAnalysisMetrics } = require('../utils/aiAnalytics');

const router = express.Router();
router.use(requireAuth);

const AI_PROVIDER = String(process.env.AI_PROVIDER || 'ollama').toLowerCase();
const AI_CACHE_MS = Number(process.env.AI_CACHE_MS || process.env.XAI_CACHE_MS || 60 * 1000);

const PROVIDERS = {
  ollama: {
    name: 'Ollama',
    apiKeyEnv: 'OLLAMA_API_KEY',
    model: process.env.OLLAMA_MODEL || 'gemma3:270m',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api',
  },
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

const providerConfig = PROVIDERS[AI_PROVIDER] || PROVIDERS.ollama;
const AI_MODEL = providerConfig.model;
const AI_BASE_URL = providerConfig.baseUrl;
const AI_API_KEY = process.env[providerConfig.apiKeyEnv];
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 512);
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 180);
const AI_FALLBACK_MODEL =
  AI_PROVIDER === 'groq' ? process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant' : null;

const analysisCaches = new Map();
const analysisPromises = new Map();

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

  if (providerConfig.apiKeyEnv && !AI_API_KEY && AI_PROVIDER !== 'ollama') {
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

async function callProviderJson(messages, modelOverride = AI_MODEL) {
  if (providerConfig.apiKeyEnv && !AI_API_KEY && AI_PROVIDER !== 'ollama') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const isOllama = AI_PROVIDER === 'ollama';
    const response = await fetch(`${AI_BASE_URL}${isOllama ? '/chat' : '/chat/completions'}`, {
      method: 'POST',
      headers: {
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        isOllama
          ? {
              model: modelOverride,
              messages,
              stream: false,
              format: 'json',
              options: {
                temperature: 0.2,
                num_ctx: OLLAMA_NUM_CTX,
                num_predict: OLLAMA_NUM_PREDICT,
                num_batch: 32,
              },
              keep_alive: '2m',
            }
          : {
              model: modelOverride,
              messages,
              stream: false,
              temperature: 0.2,
              max_tokens: 900,
            },
      ),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.error || payload?.message || `${providerConfig.name} returned ${response.status}`;
      const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      error.status = response.status;
      throw error;
    }

    const parsed = normalizeJsonObject(
      isOllama ? payload?.message?.content || payload?.response : payload?.choices?.[0]?.message?.content,
    );
    if (parsed && typeof parsed === 'object') {
      parsed.__providerModel = modelOverride;
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalWarehouseRisks(products, purchaseMap) {
  const toDays = (ms) => Math.floor(ms / (1000 * 60 * 60 * 24));
  const now = new Date();

  return products.map((p) => {
    const lastPurchase = purchaseMap.get(p.productId);
    const daysInStock = lastPurchase ? Math.max(0, toDays(now.getTime() - new Date(lastPurchase).getTime())) : null;
    const shelfLifeDays = resolveShelfLifeDays({
      itemName: p.itemName,
      unit: p.unit,
      shelfLifeDays: p.shelfLifeDays,
    });
    // Product-level purchases cannot establish the expiry of individual stock batches.
    const daysToExpiry = null;

    const stockRisk =
      p.qtyOnHand === 0
        ? 'critical'
        : p.qtyOnHand <= Math.max(1, Math.floor(p.lowStockThreshold * 0.2))
        ? 'high'
        : p.qtyOnHand <= p.lowStockThreshold
        ? 'medium'
        : 'low';

    const riskLevel = stockRisk;
    const ageReason = daysInStock === null ? 'Receipt history unavailable; batch expiry unknown' : `${daysInStock} days since latest receipt; batch expiry unknown`;
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
          ? 'Review available stock and replenish if needed'
          : riskLevel === 'high'
          ? 'Plan replenishment'
          : 'Monitor stock and confirm batch expiry separately',
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
      const suggestedQty = Math.max(Math.max(p.lowStockThreshold * 2, 10) - p.qtyOnHand, 0);
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
      timestamp: new Date(order.createdAt).toISOString(),
    }));
}

const buildLocalLogisticsSnapshot = buildLogisticsSnapshot;
function buildLocalAnalysis(snapshot) {
  const { products, purchases, clientOrders, deliveries, transactions = [], filters = parseInsightFilters() } = snapshot;
  const purchaseMap = new Map(purchases.map((p) => [p.productId, p._max.date]));
  const warehouseRisks = buildLocalWarehouseRisks(products, purchaseMap);
  const reorderSuggestions = buildLocalReorderSuggestions(products);
  const fraudAlerts = buildLocalFraudAlerts(clientOrders);
  const logisticsSnapshot = buildLocalLogisticsSnapshot(deliveries);
  const critical = warehouseRisks.filter((risk) => risk.riskLevel === 'critical').length;
  const high = warehouseRisks.filter((risk) => risk.riskLevel === 'high').length;
  const reorderTotal = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);
  const usage = buildUsageTrends(products, transactions, filters);

  return {
    enabled: false,
    provider: 'local-rules',
    model: AI_MODEL,
    generatedAt: new Date().toISOString(),
    availabilityReason: AI_PROVIDER === 'ollama' || AI_API_KEY ? 'fallback_after_error' : 'missing_api_key',
    availabilityMessage: AI_PROVIDER === 'ollama' || AI_API_KEY
      ? `${providerConfig.name} analysis is temporarily unavailable, so local operational rules are being used.`
      : `${providerConfig.apiKeyEnv} is not configured on the backend service.`,
    summary: `${usage.dataCoverage.issueCount} recorded stock issues across ${usage.dataCoverage.activeMonths} active months in the selected range; ${usage.dataCoverage.simulatedIssueCount} are simulated. Current selected inventory has ${critical} critical and ${high} high-risk items. ${logisticsSnapshot.measuredDeliveries} completed deliveries have dates suitable for on-time measurement. This is recorded history, not a validated forecast.`,
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
        message: `${logisticsSnapshot.activeRoutes} active routes. ${logisticsSnapshot.onTimeRate === null ? 'Insufficient completed delivery dates to measure on-time performance.' : `${logisticsSnapshot.onTimeRate}% on time across ${logisticsSnapshot.measuredDeliveries} measured deliveries.`}`,
        priority: logisticsSnapshot.onTimeRate !== null && logisticsSnapshot.onTimeRate < 85 ? 'high' : 'low',
        action: logisticsSnapshot.recommendation,
      },
    ],
    warehouseRisks,
    reorderSuggestions,
    fraudAlerts,
    logisticsSnapshot,
    ...usage,
    inventoryScope: 'Current inventory follows the selected product and data source. Date filters apply to historical usage, orders, and deliveries, not to a reconstructed past stock balance.',
  };
}

async function buildSnapshot(filters) {
  const products = await prisma.product.findMany({ where: { deletedAt: null }, orderBy: { itemName: 'asc' } });
  const selectedIds = products.filter((product) => filters.product === 'all' || findThortexProduct(product.itemName)?.key === filters.product).map((product) => product.productId);
  const date = { gte: new Date(filters.from + 'T00:00:00.000Z'), lte: new Date(filters.to + 'T23:59:59.999Z') };
  const [transactions, purchases, orders, deliveries] = await Promise.all([
    prisma.stockTransaction.findMany({ where: { date, productId: { in: selectedIds } }, orderBy: [{ date: 'asc' }, { transactionId: 'asc' }] }),
    prisma.stockTransaction.groupBy({ by: ['productId'], where: { type: 'PURCHASE' }, _max: { date: true } }),
    prisma.clientOrder.findMany({
      where: { deletedAt: null, orderDate: date, ...(filters.product === 'all' ? {} : { items: { some: { productId: { in: selectedIds } } } }) },
      include: { client: true, project: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' },
    }),
    prisma.delivery.findMany({
      where: { deletedAt: null, createdAt: date, ...(filters.product === 'all' ? {} : { items: { some: { orderItem: { productId: { in: selectedIds } } } } }) },
      include: { assignedDeliveryGuy: { select: { fullName: true } }, clientOrder: { include: { client: true } } }, orderBy: { createdAt: 'desc' },
    }),
  ]);
  return {
    products: products.filter((product) => selectedIds.includes(product.productId) && (filters.source === 'all' || (filters.source === 'simulated' ? product.itemName.startsWith('[SIMULATED]') : !product.itemName.startsWith('[SIMULATED]')))), purchases, transactions,
    clientOrders: orders.filter((order) => matchesSource(order, filters.source)),
    deliveries: deliveries.filter((delivery) => matchesSource(delivery, filters.source)),
    filters,
  };
}
function compactSnapshot(snapshot, fallback) {
  const isOllama = AI_PROVIDER === 'ollama';
  const rankedWarehouseRisks = [...fallback.warehouseRisks]
    .sort((a, b) => priorityRank(b.riskLevel) - priorityRank(a.riskLevel))
    .slice(0, isOllama ? 3 : 12)
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
    .slice(0, isOllama ? 3 : 10);

  const rankedOrders = snapshot.clientOrders
    .slice()
    .sort((a, b) => toNumber(b.total) - toNumber(a.total))
    .slice(0, isOllama ? 3 : 10)
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
    .slice(0, isOllama ? 2 : 8)
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
    dataCoverage: fallback.dataCoverage,
    inventoryScope: fallback.inventoryScope,
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
    ...(isOllama ? {} : {
      currency: 'PHP',
    }),
  };
}

function sanitizeAnalysis(ai, fallback) {
  return {
    ...lockAnalysisMetrics(ai, fallback),
    enabled: Boolean(ai),
    provider: ai ? AI_PROVIDER : fallback.provider,
    model: String(ai?.__providerModel || AI_MODEL),
    generatedAt: new Date().toISOString(),
    availabilityReason: ai ? 'available' : fallback.availabilityReason,
    availabilityMessage: ai ? `${providerConfig.name} advisory text is available. Numerical metrics are calculated from database records.` : fallback.availabilityMessage,
  };
}
async function generateAiAnalysis(force = false, query = {}) {
  const filters = parseInsightFilters(query);
  const cacheKey = JSON.stringify(filters);
  const cached = analysisCaches.get(cacheKey);
  if (!force && cached && Date.now() - cached.createdAt < AI_CACHE_MS) {
    return cached.data;
  }

  if (analysisPromises.has(cacheKey)) return analysisPromises.get(cacheKey);

  const analysisPromise = (async () => {
    const snapshot = await buildSnapshot(filters);
    const fallback = buildLocalAnalysis(snapshot);
    let ai = null;
    let failure = null;

    try {
      const snapshotPayload = compactSnapshot(snapshot, fallback);
      const isOllama = AI_PROVIDER === 'ollama';
      const messages = [
        {
          role: 'system',
          content:
            isOllama
              ? 'Return compact JSON with summary and recommendations only. Describe only the supplied facts. Do not invent statistics or forecasts.'
              : 'You are the operations analyst for Impex Engineering. Return JSON with summary and recommendations only, based on the supplied metrics. Do not invent statistics, forecasts, discounts, or accusations of fraud. Distinguish simulated and existing records.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Return only {summary:string,recommendations:[{title:string,message:string,priority:"low"|"medium"|"high"|"critical",action:string}]}. At most three recommendations. Explain the selected data coverage and distinguish simulated records. Do not fabricate metrics.',
            snapshot: snapshotPayload,
          }),
        },
      ];

      ai = await callProviderJson(messages);
    } catch (err) {
      if (
        AI_PROVIDER === 'groq' &&
        AI_FALLBACK_MODEL &&
        AI_FALLBACK_MODEL !== AI_MODEL &&
        Number(err?.status || 0) === 429
      ) {
        try {
          ai = await callProviderJson(
            [
              {
                role: 'system',
                content:
                  'You are the AI operations analyst for Impex Engineering. Return only valid JSON. Analyze inventory, reorder, purchase-order/payment risk, and logistics. Keep outputs concise, actionable, and based only on the provided summarized data.',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  task:
                    'Return only {summary:string,recommendations:[{title:string,message:string,priority:string,action:string}]}. At most three recommendations. Distinguish simulated records and never fabricate statistics.',
                  currency: 'PHP',
                  snapshot: compactSnapshot(snapshot, fallback),
                }),
              },
            ],
            AI_FALLBACK_MODEL,
          );
        } catch (fallbackErr) {
          failure = mapProviderFailure(fallbackErr);
          console.error(`${providerConfig.name} fallback analysis failed:`, fallbackErr.message || fallbackErr);
        }
      } else {
        failure = mapProviderFailure(err);
        console.error(`${providerConfig.name} analysis failed:`, err.message || err);
      }
    }

    const data = sanitizeAnalysis(ai, fallback);
    if (!ai && failure) {
      data.availabilityReason = failure.reason;
      data.availabilityMessage = failure.message;
      data.summary = `${fallback.summary} Reason: ${failure.message}`;
    }
    if (analysisCaches.size >= 32) analysisCaches.delete(analysisCaches.keys().next().value);
    analysisCaches.set(cacheKey, { createdAt: Date.now(), data });
    return data;
  })();
  analysisPromises.set(cacheKey, analysisPromise);

  try {
    return await analysisPromise;
  } finally {
    analysisPromises.delete(cacheKey);
  }
}

router.get('/analysis', async (_req, res, next) => {
  try {
    res.json(await generateAiAnalysis(false, _req.query));
  } catch (err) {
    res.status(err.status || 503).json({ error: err.status === 400 ? err.message : 'Unable to read database records for insights. Try again after the database connection is restored.' });
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
    const analysis = await generateAiAnalysis(true, _req.body);
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
