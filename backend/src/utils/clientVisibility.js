function inferCompanyNameFromUser(user) {
  const rawName = String(user?.fullName || '').trim();
  if (!rawName) return null;

  return rawName
    .replace(/\b(procurement|purchasing|buyer|account)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || rawName;
}

async function resolveLinkedClient(prisma, userOrId) {
  const user =
    typeof userOrId === 'object' && userOrId
      ? userOrId
      : await prisma.user.findUnique({ where: { userId: Number(userOrId) } });

  if (!user?.email) return { user: user || null, client: null };

  const exactEmailClient = await prisma.client.findFirst({
    where: { email: user.email, deletedAt: null },
    orderBy: { clientId: 'asc' },
  });
  if (exactEmailClient) {
    const exactEmailBaseName = inferBaseName(exactEmailClient.clientName);
    if (
      exactEmailBaseName &&
      exactEmailBaseName !== exactEmailClient.clientName
    ) {
      const canonicalFromEmail = await prisma.client.findFirst({
        where: {
          clientName: { equals: exactEmailBaseName, mode: 'insensitive' },
          deletedAt: null,
          clientId: { not: exactEmailClient.clientId },
        },
        orderBy: { clientId: 'asc' },
      });
      if (canonicalFromEmail) {
        return { user, client: canonicalFromEmail };
      }
    }
    return { user, client: exactEmailClient };
  }

  const inferredCompanyName = inferCompanyNameFromUser(user);
  if (inferredCompanyName) {
    const exactNameClient = await prisma.client.findFirst({
      where: { clientName: inferredCompanyName, deletedAt: null },
      orderBy: { clientId: 'asc' },
    });
    if (exactNameClient) {
      return { user, client: exactNameClient };
    }

    const containsNameClient = await prisma.client.findFirst({
      where: {
        clientName: { contains: inferredCompanyName, mode: 'insensitive' },
        deletedAt: null,
      },
      orderBy: { clientId: 'asc' },
    });
    if (containsNameClient) {
      return { user, client: containsNameClient };
    }
  }

  return { user, client: null };
}

async function resolveClientAccess(prisma, userId) {
  const { user, client } = await resolveLinkedClient(prisma, userId);
  if (!user?.email) return null;
  const visibilityScope = String(client?.visibilityScope || 'COMPANY').toUpperCase();
  return {
    user,
    client,
    visibilityScope,
    isUserScoped: visibilityScope === 'USER',
  };
}

function buildClientOrderScope(access) {
  if (!access?.client?.clientId) {
    return { clientOrderId: -1 };
  }

  if (access.isUserScoped) {
    return {
      clientId: access.client.clientId,
      createdBy: access.user.userId,
    };
  }

  return { clientId: access.client.clientId };
}

function buildNestedClientOrderScope(access, relationName = 'clientOrder') {
  if (!access?.client?.clientId) {
    return { deliveryId: -1 };
  }

  const nestedScope = access.isUserScoped
    ? { clientId: access.client.clientId, createdBy: access.user.userId }
    : { clientId: access.client.clientId };

  return { [relationName]: nestedScope };
}

function canAccessClientOwnedRecord(access, record) {
  if (!access?.client?.clientId || !record) {
    return false;
  }

  const recordClientId = Number(record.clientId);
  if (recordClientId !== access.client.clientId) {
    return false;
  }

  if (!access.isUserScoped) {
    return true;
  }

  return Number(record.createdBy) === access.user.userId;
}

module.exports = {
  inferCompanyNameFromUser,
  resolveLinkedClient,
  resolveClientAccess,
  buildClientOrderScope,
  buildNestedClientOrderScope,
  canAccessClientOwnedRecord,
};
