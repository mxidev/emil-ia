import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ChatRequestSchema } from '@emil-ia/contracts';
import { routePrompt } from './router.js';
import { createProvider } from './provider.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });
await app.register(sensible);
const provider = createProvider();
const conversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

app.get('/health', async () => ({ status: 'ok', provider: provider.constructor.name }));
app.get('/api/conversations', async () => [...conversations.keys()].map((id) => ({ id })));
app.post('/api/chat', async (request, reply) => {
  const parsed = ChatRequestSchema.safeParse(request.body);
  if (!parsed.success) return reply.badRequest(JSON.stringify(parsed.error.flatten()));
  const conversationId = parsed.data.conversationId ?? crypto.randomUUID();
  const history = conversations.get(conversationId) ?? [];
  history.push({ role: 'user', content: parsed.data.content }); conversations.set(conversationId, history);
  const { intent, profile } = routePrompt(parsed.data.content);
  reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-conversation-id': conversationId });
  let answer = '';
  try { for await (const event of provider.stream({ messages: history, profile, intent })) { if (event.type === 'text') { answer += event.delta; reply.raw.write(`event: token\ndata: ${JSON.stringify({ delta: event.delta })}\n\n`); } else reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, conversationId })}\n\n`); } history.push({ role: 'assistant', content: answer }); } catch (error) { reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : 'Error desconocido' })}\n\n`); } finally { reply.raw.end(); }
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== 'test') await app.listen({ port, host: '0.0.0.0' });
export { app };
