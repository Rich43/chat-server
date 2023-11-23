// noinspection GraphQLTypeRedefinition

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { readFileSync } from "fs";
import { Message, Resolvers } from "./generated/graphql";

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

const server = new ApolloServer({
    typeDefs,
    resolvers,
});

const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
});

console.log(`🚀  Server ready at: ${url}`);
