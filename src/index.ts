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

let idCounter = 0;
const PORT = 4000;
const PRUNE_TIME = 1000 * 60;
const MESSAGE_UPDATED = 'MESSAGE_UPDATED';
const MESSAGE_PRUNED = 'MESSAGE_PRUNED';

const pubSub = new PubSub();

const typeDefs = readFileSync('./src/schema.graphql', { encoding: 'utf-8' });

const messages: Message[] = [
];

const resolvers: Resolvers = {
    Query: {
        messages: (_parent, args) => {
            return messages.filter((message) => message.session === args.session);
        },
    },
    Mutation: {
        createMessage: (parent, args, contextValue, info) => {
            idCounter++;
            const newMessage: Message = {
                id: idCounter.toString(),
                message: args.message,
                created: new Date().toISOString(),
                session: args.session,
            };
            messages.push(newMessage);
            const msgs = messages.filter((msg) => msg.session === args.session);
            pubSub.publish(MESSAGE_UPDATED, {updateMessage: msgs}).then(_r => {});
            return msgs;
        },
    },
    Subscription: {
        updateMessage: {
            subscribe: () => pubSub.asyncIterator([MESSAGE_UPDATED]),
        },
        messagePruned: {
            subscribe: () => pubSub.asyncIterator([MESSAGE_PRUNED]),
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

function messagePruner() {
    let i = 0;
    while (i < messages.length) {
        const message = messages[i];
        const created = new Date(message.created);
        const now = new Date();
        const diff = now.getTime() - created.getTime();
        if (diff > PRUNE_TIME) {
            messages.splice(i, 1);
            pubSub.publish(MESSAGE_PRUNED, {messagePruned: messages.filter((msg) => msg.session === message.session)}).then(_r => {});
        } else {
            i++;
        }
    }

    setTimeout(messagePruner, 1000);
}

messagePruner();
