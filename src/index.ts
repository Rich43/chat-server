// noinspection GraphQLTypeRedefinition

import { ApolloServer } from '@apollo/server';
import { readFileSync } from "fs";
import { Message, Resolvers } from "./generated/graphql";
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import cors from 'cors';
import { expressMiddleware } from "@apollo/server/express4";

const typeDefs = readFileSync('./src/schema.graphql', { encoding: 'utf-8' });

const messages: Message[] = [
    {
        id: "1",
        message: 'The Awakening',
        created: new Date().toISOString(),
        session: 123,
    },
    {
        id: "2",
        message: 'City of Glass',
        created: new Date().toISOString(),
        session: 123,
    },
];

const resolvers: Resolvers = {
    Query: {
        messages: (_parent, args) => {
            const foundMessages = messages.filter((message) => message.session === args.session);
            const msgs: Message[] = foundMessages.map((message) => {
                return {
                    id: message.id,
                    message: message.message,
                    created: message.created,
                    session: message.session,
                };
            });
            return msgs;
        },
    },
    Mutation: {
        createMessage: (parent, args, contextValue, info) => {
            const newMessage: Message = {
                id: (messages.length + 1).toString(),
                message: args.message,
                created: new Date().toISOString(),
                session: args.session,
            };
            messages.push(newMessage);
            return newMessage;
        },
    }
};

const app = express();
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/subscriptions',
});

const schema = makeExecutableSchema({ typeDefs, resolvers });

const serverCleanup = useServer({ schema }, wsServer);

const server = new ApolloServer({
    schema,
    plugins: [
        // Proper shutdown for the HTTP server.
        ApolloServerPluginDrainHttpServer({ httpServer }),

        // Proper shutdown for the WebSocket server.
        {
            async serverWillStart() {
                return {
                    async drainServer() {
                        await serverCleanup.dispose();
                    },
                };
            },
        },
    ],
});

await server.start();

app.use('/graphql', cors<cors.CorsRequest>(), express.json(), expressMiddleware(server));

console.log(`🚀  Server ready at: http://localhost:4000/`);
