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
import bodyParser from 'body-parser';
import { expressMiddleware } from "@apollo/server/express4";
import { PubSub } from 'graphql-subscriptions-continued';

const PORT = 4000;
const MESSAGE_UPDATED = 'MESSAGE_UPDATED';

const pubSub = new PubSub();

const typeDefs = readFileSync('./src/schema.graphql', { encoding: 'utf-8' });

const messages: Message[] = [
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
            pubSub.publish(MESSAGE_UPDATED, {updateMessage: newMessage}).then(r => ({}));
            return newMessage;
        },
    },
    Subscription: {
        updateMessage: {
            subscribe: () => pubSub.asyncIterator([MESSAGE_UPDATED]),
        },
    },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
});

const serverCleanup = useServer({ schema }, wsServer);

const server = new ApolloServer({
    schema,
    plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),

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
app.use('/graphql', cors<cors.CorsRequest>(), bodyParser.json(), expressMiddleware(server));

httpServer.listen(PORT, () => {
    console.log(`🚀 Query endpoint ready at http://localhost:${PORT}/graphql`);
    console.log(`🚀 Subscription endpoint ready at ws://localhost:${PORT}/graphql`);
});
