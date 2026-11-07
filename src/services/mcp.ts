import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { Tool } from '@olegpolyakov/backend/features/ai';
import type { JsonSchema } from '@olegpolyakov/core/utils/schema';

import { IntegrationModel } from '@/models';

export default class MCPService {
    private clients = new Map<string, Map<string, Promise<Client>>>();

    constructor(private Integration: IntegrationModel) {}

    async getTools(userId: string, accessToken: string): Promise<Tool[]> {
        const integrations = await this.Integration.find({ userId, type: 'mcp', enabled: true });
        const tools = await Promise.all(
            integrations.flatMap(async i => {
                const client = await this.getClient({
                    name: i.name,
                    url: i.url,
                    accessToken,
                    userId
                });
            
                const tools = await client.listTools();
        
                return tools.tools.map(t => new Tool(
                    t.name,
                    t.description,
                    t.inputSchema as JsonSchema,
                    args => client.callTool({ name: t.name, arguments: args })
                ));
            })
        );

        return tools.flat();
    }

    async getClient({ name, url, userId, accessToken }: { name: string; url: string, userId: string; accessToken: string }): Promise<Client> {
        let userClients = this.clients.get(userId);

        if (!userClients) {
            userClients = new Map();
            this.clients.set(userId, userClients);
        }

        let promise = userClients.get(name);

        if (!promise) {
            promise = this.createClient({ url, accessToken });

            userClients.set(name, promise);

            void promise.catch(() => {
                if (userClients.get(name) === promise) {
                    userClients.delete(name);
                }
            });
        }

        return promise;
    }

    private async createClient({ url, accessToken }: { url: string, accessToken: string }): Promise<Client> {
        const client = new Client({ name: 'tasks', version: '1.0.0' });
        const transport = new StreamableHTTPClientTransport(
            new URL(url),
            {
                requestInit: {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                }
            }
        );

        await client.connect(transport);

        return client;
    }
}