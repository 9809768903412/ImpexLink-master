import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MessageSquare, Plus, Search, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { ChatMessage, ChatThread, ChatUser } from '@/types';
import { cn } from '@/lib/utils';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function roleLabel(user: ChatUser) {
  const role = (user.roles?.[0] || user.role || '').toString();
  return role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function MessagesPanel({ audience }: { audience: 'admin' | 'client' }) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [recipients, setRecipients] = useState<ChatUser[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) || null;
  const filteredThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return threads;
    return threads.filter((thread) =>
      [thread.title, thread.lastMessage?.body, ...thread.participants.map((participant) => participant.name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [threads, search]);

  const fetchThreads = async () => {
    const response = await apiClient.get('/messages/threads', {
      params: { page: 1, pageSize: 50, q: search || undefined },
    });
    const items = response.data?.data || response.data || [];
    setThreads(items);
    if (!selectedThreadId && items[0]) setSelectedThreadId(items[0].id);
  };

  const fetchRecipients = async () => {
    const response = await apiClient.get('/messages/recipients');
    setRecipients(response.data || []);
  };

  const fetchMessages = async (threadId: string) => {
    if (!threadId) return;
    const response = await apiClient.get(`/messages/threads/${threadId}/messages`);
    setMessages(response.data || []);
    setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, unreadCount: 0 } : thread)));
  };

  useEffect(() => {
    fetchThreads().catch(() => setThreads([]));
    fetchRecipients().catch(() => setRecipients([]));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchThreads().catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedThreadId).catch(() => setMessages([]));
  }, [selectedThreadId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchThreads().catch(() => undefined);
      if (selectedThreadId) fetchMessages(selectedThreadId).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [selectedThreadId, search]);

  const startThread = async () => {
    if (!recipientId) {
      toast({ title: 'Choose a recipient', description: 'Select who this message is for.', variant: 'destructive' });
      return;
    }
    try {
      const response = await apiClient.post('/messages/threads', { recipientId });
      const thread = response.data as ChatThread;
      setThreads((prev) => [thread, ...prev.filter((item) => item.id !== thread.id)]);
      setSelectedThreadId(thread.id);
      setNewMessageOpen(false);
      setRecipientId('');
    } catch (error: any) {
      toast({
        title: 'Unable to start chat',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const sendMessage = async () => {
    if (!selectedThreadId || !draft.trim()) return;
    setLoading(true);
    try {
      const response = await apiClient.post(`/messages/threads/${selectedThreadId}/messages`, {
        body: draft.trim(),
      });
      setMessages((prev) => [...prev, response.data]);
      setDraft('');
      await fetchThreads();
    } catch (error: any) {
      toast({
        title: 'Message not sent',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <MessageSquare className="h-6 w-6 text-primary" />
            Messages
          </h2>
          <p className="text-muted-foreground">
            {audience === 'client'
              ? 'Message Impex admins about orders, projects, payments, and deliveries.'
              : 'Coordinate with clients, sales, warehouse, drivers, and office staff.'}
          </p>
        </div>
        <Button onClick={() => setNewMessageOpen(true)} className="gap-2">
          <Plus size={16} />
          New Message
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid min-h-[68vh] grid-cols-1 lg:grid-cols-[340px_1fr]">
          <div className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search conversations..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-[34vh] overflow-y-auto lg:max-h-[calc(68vh-74px)]">
              {filteredThreads.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No conversations yet. Start a message to create one.
                </div>
              ) : (
                filteredThreads.map((thread) => {
                  const person = thread.otherParticipants[0] || thread.participants[0];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => setSelectedThreadId(thread.id)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60',
                        selectedThreadId === thread.id && 'bg-primary/10'
                      )}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{initials(person?.name || 'IM')}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{thread.title}</p>
                          {thread.unreadCount > 0 && <Badge>{thread.unreadCount}</Badge>}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {thread.lastMessage?.body || roleLabel(person || { id: '', name: '', email: '', role: '' })}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-[68vh] flex-col">
            {selectedThread ? (
              <>
                <div className="border-b p-4">
                  <CardTitle className="text-lg">{selectedThread.title}</CardTitle>
                  <CardDescription>
                    {selectedThread.participants.map((participant) => participant.name).join(' • ')}
                  </CardDescription>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-muted/10 p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Start the conversation with a short message.
                    </div>
                  ) : (
                    messages.map((message) => {
                      const mine = message.senderId === user?.id;
                      return (
                        <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                          <div
                            className={cn(
                              'max-w-[88%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]',
                              mine ? 'bg-primary text-primary-foreground' : 'border bg-card'
                            )}
                          >
                            {!mine && <p className="mb-1 text-xs font-medium text-muted-foreground">{message.senderName}</p>}
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                            <p className={cn('mt-1 text-[11px]', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
                              {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t p-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      className="min-h-[52px] resize-none"
                    />
                    <Button onClick={sendMessage} disabled={loading || !draft.trim()} className="gap-2 sm:self-end">
                      <Send size={16} />
                      Send
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="font-medium">Select a conversation</p>
                  <p className="text-sm text-muted-foreground">Messages will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Select the person or office account you need to contact.</DialogDescription>
          </DialogHeader>
          <Select value={recipientId} onValueChange={setRecipientId}>
            <SelectTrigger>
              <SelectValue placeholder="Select recipient" />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((recipient) => (
                <SelectItem key={recipient.id} value={recipient.id}>
                  {recipient.name} - {roleLabel(recipient)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewMessageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={startThread}>Start Chat</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
