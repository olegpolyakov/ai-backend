import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { Tool } from '@olegpolyakov/ai-core';
import type { JsonSchema } from '@olegpolyakov/core/utils/schema';

import { IntegrationModel } from '@/models';

export default class MCPService {
    private clients = new Map<string, Map<string, Promise<Client>>>();

    constructor(private Integration: IntegrationModel) {}

    async getTools(userId: string, accessToken: string): Promise<Tool[]> {
        const integrations = await this.Integration.find({ userId, type: 'mcp', enabled: true });
        const tools = await Promise.allSettled(
            integrations.flatMap(async i => {
                const client = await this.getClient({
                    name: i.name,
                    url: i.url,
                    accessToken,
                    userId
                }).catch(error => {
                    throw new Error(`MCPService: Could not connect to ${i.name} MCP server at ${i.url}`, { cause: error });
                });
            
                const tools = await client.listTools()
                    .catch(error => {
                        throw new Error(`MCPService: Could not list tools for ${i.name} MCP server at ${i.url}`, { cause: error });
                    });
        
                return tools.tools.map(t => new Tool(
                    t.name,
                    t.description,
                    t.inputSchema as JsonSchema,
                    args => client.callTool({ name: t.name, arguments: args as Record<string, unknown> })
                ));
            })
        ).then(results => {
            results
                .filter(r => r.status === 'rejected')
                .forEach(r => console.error(r.reason));

            return results
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);
        });

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