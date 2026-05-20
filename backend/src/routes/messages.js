const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth, getRoleList } = require('../middleware/auth');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const router = express.Router();
router.use(requireAuth);

const ADMIN_ROLES = ['ADMIN', 'PRESIDENT'];
const STAFF_ROLES = [
  'PROJECT_MANAGER',
  'PROJECT_IN_CHARGE',
  'SALES_AGENT',
  'ENGINEER',
  'PAINT_CHEMIST',
  'WAREHOUSE_STAFF',
  'DELIVERY_GUY',
  'DRIVER',
  'RECEIVER',
];

function hasAnyRole(user, roles) {
  const userRoles = getRoleList(user);
  return roles.some((role) => userRoles.includes(role));
}

function roleFilter(roleNames) {
  return {
    OR: [
      { role: { roleName: { in: roleNames } } },
      { userRoles: { some: { role: { roleName: { in: roleNames } } } } },
    ],
  };
}

function mapUser(user) {
  const roles = [
    user.role?.roleName,
    ...(user.userRoles || []).map((entry) => entry.role?.roleName),
  ]
    .filter(Boolean)
    .map((role) => String(role).toLowerCase());
  return {
    id: user.userId.toString(),
    name: user.fullName,
    email: user.email,
    role: roles[0] || 'client',
    roles,
  };
}

function mapMessage(message) {
  return {
    id: message.messageId.toString(),
    threadId: message.threadId.toString(),
    senderId: message.senderId.toString(),
    senderName: message.sender?.fullName || 'User',
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function mapThread(thread, viewerId) {
  const participant = thread.participants.find((entry) => entry.userId === viewerId);
  const otherParticipants = thread.participants
    .filter((entry) => entry.userId !== viewerId)
    .map((entry) => mapUser(entry.user));
  const lastMessage = thread.messages?.[0] ? mapMessage(thread.messages[0]) : null;
  return {
    id: thread.threadId.toString(),
    title: thread.title || otherParticipants.map((user) => user.name).join(', ') || 'Conversation',
    type: String(thread.threadType || 'DIRECT').toLowerCase(),
    participants: thread.participants.map((entry) => mapUser(entry.user)),
    otherParticipants,
    unreadCount: participant?.unreadCount || 0,
    lastMessage,
    updatedAt: thread.updatedAt.toISOString(),
    createdAt: thread.createdAt.toISOString(),
  };
}

async function ensureThreadAccess(threadId, userId) {
  const participant = await prisma.chatParticipant.findUnique({
    where: { threadId_userId: { threadId: Number(threadId), userId: Number(userId) } },
  });
  return Boolean(participant);
}

async function getClientAssignedEngineerIds(userId) {
  const client = (await require('../utils/clientVisibility').resolveLinkedClient(prisma, userId))?.client;
  if (!client?.clientId) return [];
  const projects = await prisma.project.findMany({
    where: {
      clientId: client.clientId,
      deletedAt: null,
      assignedPmId: { not: null },
    },
    include: {
      assignedPm: { include: { role: true, userRoles: { include: { role: true } } } },
    },
  });
  return [
    ...new Set(
      projects
        .filter((project) => {
          const roles = [
            project.assignedPm?.role?.roleName,
            ...(project.assignedPm?.userRoles || []).map((entry) => entry.role?.roleName),
          ]
            .filter(Boolean)
            .map((role) => String(role).toUpperCase());
          return roles.includes('ENGINEER');
        })
        .map((project) => project.assignedPmId)
        .filter(Boolean)
    ),
  ];
}

async function canMessageUser(req, recipientId) {
  if (Number(req.user.userId) === Number(recipientId)) return false;
  const recipient = await prisma.user.findUnique({
    where: { userId: Number(recipientId), deletedAt: null },
    include: { role: true, userRoles: { include: { role: true } } },
  });
  if (!recipient) return false;

  const currentIsAdmin = hasAnyRole(req.user, ADMIN_ROLES);
  const currentIsClient = hasAnyRole(req.user, ['CLIENT']);
  const recipientRoles = [
    recipient.role?.roleName,
    ...(recipient.userRoles || []).map((entry) => entry.role?.roleName),
  ].filter(Boolean).map((role) => String(role).toUpperCase());
  const recipientIsAdmin = recipientRoles.some((role) => ADMIN_ROLES.includes(role));
  const recipientIsClient = recipientRoles.includes('CLIENT');
  const recipientIsStaff = recipientRoles.some((role) => STAFF_ROLES.includes(role));
  const recipientIsEngineer = recipientRoles.includes('ENGINEER');

  if (currentIsAdmin) return recipientIsStaff;
  if (currentIsClient) {
    if (!recipientIsEngineer) return false;
    const assignedEngineerIds = await getClientAssignedEngineerIds(req.user.userId);
    return assignedEngineerIds.includes(Number(recipientId));
  }
  return recipientIsAdmin && !recipientIsClient;
}

router.get('/recipients', async (req, res, next) => {
  try {
    const q = req.query.q ? String(req.query.q) : '';
    const currentIsAdmin = hasAnyRole(req.user, ADMIN_ROLES);
    const currentIsClient = hasAnyRole(req.user, ['CLIENT']);
    const clientEngineerIds = currentIsClient ? await getClientAssignedEngineerIds(req.user.userId) : [];
    const allowedRoles = currentIsAdmin ? STAFF_ROLES : currentIsClient ? ['ENGINEER'] : ADMIN_ROLES;
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        userId: { not: req.user.userId },
        ...(currentIsClient ? { userId: { in: clientEngineerIds.length ? clientEngineerIds : [-1] } } : {}),
        status: 'ACTIVE',
        ...roleFilter(allowedRoles),
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { role: true, userRoles: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
    res.json(users.map(mapUser));
  } catch (err) {
    next(err);
  }
});

router.get('/threads', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const where = {
      participants: { some: { userId: req.user.userId } },
      closedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { messages: { some: { body: { contains: q, mode: 'insensitive' } } } },
              { participants: { some: { user: { fullName: { contains: q, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [threads, total] = await Promise.all([
      prisma.chatThread.findMany({
        where,
        include: {
          participants: { include: { user: { include: { role: true, userRoles: { include: { role: true } } } } } },
          messages: {
            where: { deletedAt: null },
            include: { sender: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
      }),
      prisma.chatThread.count({ where }),
    ]);
    const data = threads.map((thread) => mapThread(thread, req.user.userId));
    if (pagination) return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/threads', async (req, res, next) => {
  try {
    const recipientId = Number(req.body.recipientId);
    if (!recipientId) return res.status(400).json({ error: 'Recipient is required' });
    if (!(await canMessageUser(req, recipientId))) {
      return res.status(403).json({ error: 'You cannot message that recipient.' });
    }

    const existingThreads = await prisma.chatThread.findMany({
      where: {
        threadType: 'DIRECT',
        closedAt: null,
        participants: { some: { userId: req.user.userId } },
      },
      include: { participants: true },
    });
    const directThread = existingThreads.find((thread) => {
      const ids = thread.participants.map((participant) => participant.userId).sort((a, b) => a - b);
      return ids.length === 2 && ids[0] === Math.min(req.user.userId, recipientId) && ids[1] === Math.max(req.user.userId, recipientId);
    });

    const thread = directThread || await prisma.chatThread.create({
      data: {
        title: req.body.title ? String(req.body.title).slice(0, 150) : null,
        threadType: 'DIRECT',
        createdById: req.user.userId,
        participants: {
          create: [
            { userId: req.user.userId, lastReadAt: new Date() },
            { userId: recipientId },
          ],
        },
      },
      include: {
        participants: { include: { user: { include: { role: true, userRoles: { include: { role: true } } } } } },
        messages: { include: { sender: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const hydrated = directThread
      ? await prisma.chatThread.findUnique({
          where: { threadId: directThread.threadId },
          include: {
            participants: { include: { user: { include: { role: true, userRoles: { include: { role: true } } } } } },
            messages: { where: { deletedAt: null }, include: { sender: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        })
      : thread;

    if (!directThread) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CREATE',
          target: 'ChatThread',
          details: `Started chat thread ${thread.threadId}`,
        },
      });
    }
    res.status(directThread ? 200 : 201).json(mapThread(hydrated, req.user.userId));
  } catch (err) {
    next(err);
  }
});

router.get('/threads/:id/messages', async (req, res, next) => {
  try {
    const threadId = Number(req.params.id);
    if (!(await ensureThreadAccess(threadId, req.user.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const messages = await prisma.chatMessage.findMany({
      where: { threadId, deletedAt: null },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    await prisma.chatParticipant.update({
      where: { threadId_userId: { threadId, userId: req.user.userId } },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
    res.json(messages.map(mapMessage));
  } catch (err) {
    next(err);
  }
});

router.post('/threads/:id/messages', async (req, res, next) => {
  try {
    const threadId = Number(req.params.id);
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message is required' });
    if (body.length > 2000) return res.status(400).json({ error: 'Message is too long' });
    if (!(await ensureThreadAccess(threadId, req.user.userId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const message = await prisma.chatMessage.create({
      data: { threadId, senderId: req.user.userId, body },
      include: { sender: true },
    });
    await prisma.chatThread.update({
      where: { threadId },
      data: { updatedAt: new Date() },
    });
    await prisma.chatParticipant.update({
      where: { threadId_userId: { threadId, userId: req.user.userId } },
      data: { unreadCount: 0, lastReadAt: new Date() },
    });
    const recipients = await prisma.chatParticipant.findMany({
      where: { threadId, userId: { not: req.user.userId } },
    });
    await Promise.all(
      recipients.map((recipient) =>
        prisma.chatParticipant.update({
          where: { participantId: recipient.participantId },
          data: { unreadCount: { increment: 1 } },
        })
      )
    );
    if (recipients.length > 0) {
      const recipientUsers = await prisma.user.findMany({
        where: { userId: { in: recipients.map((recipient) => recipient.userId) } },
        include: { role: true, userRoles: { include: { role: true } } },
      });
      const recipientRoleMap = new Map(
        recipientUsers.map((recipient) => [
          recipient.userId,
          [
            recipient.role?.roleName,
            ...(recipient.userRoles || []).map((entry) => entry.role?.roleName),
          ].filter(Boolean).map((role) => String(role).toUpperCase()),
        ])
      );
      await prisma.notification.createMany({
        data: recipients.map((recipient) => {
          const roles = recipientRoleMap.get(recipient.userId) || [];
          return {
            userId: recipient.userId,
            type: 'PROJECT_UPDATE',
            title: 'New message',
            message: 'You received a new message.',
            link: roles.includes('CLIENT') ? '/client/messages' : '/admin/messages',
          };
        }),
      });
    }
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'ChatMessage',
        details: `Sent message in thread ${threadId}`,
      },
    });
    res.status(201).json(mapMessage(message));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
