/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, TypeOf } from '@kbn/config-schema';

import { IScopedClusterClient } from '@kbn/core/server';
import {
  IndicesDataStream,
  IndicesDataStreamsStatsDataStreamsStatsItem,
  SecurityHasPrivilegesResponse,
} from '@elastic/elasticsearch/lib/api/types';
import { deserializeDataStream, deserializeDataStreamList } from '../../../../common/lib';
import { EnhancedDataStreamFromEs } from '../../../../common/types';
import { RouteDependencies } from '../../../types';
import { addBasePath } from '..';

const enhanceDataStreams = ({
  dataStreams,
  dataStreamsStats,
  dataStreamsPrivileges,
}: {
  dataStreams: IndicesDataStream[];
  dataStreamsStats?: IndicesDataStreamsStatsDataStreamsStatsItem[];
  dataStreamsPrivileges?: SecurityHasPrivilegesResponse;
}): EnhancedDataStreamFromEs[] => {
  return dataStreams.map((dataStream) => {
    const enhancedDataStream: EnhancedDataStreamFromEs = {
      ...dataStream,
      privileges: {
        delete_index: dataStreamsPrivileges
          ? dataStreamsPrivileges.index[dataStream.name].delete_index
          : true,
        manage_data_stream_lifecycle: dataStreamsPrivileges
          ? dataStreamsPrivileges.index[dataStream.name].manage_data_stream_lifecycle
          : true,
      },
    };

    if (dataStreamsStats) {
      const currentDataStreamStats: IndicesDataStreamsStatsDataStreamsStatsItem | undefined =
        dataStreamsStats.find(({ data_stream: statsName }) => statsName === dataStream.name);

      if (currentDataStreamStats) {
        enhancedDataStream.store_size = currentDataStreamStats.store_size;
        enhancedDataStream.store_size_bytes = currentDataStreamStats.store_size_bytes;
        enhancedDataStream.maximum_timestamp = currentDataStreamStats.maximum_timestamp;
      }
    }

    return enhancedDataStream;
  });
};

const getDataStreams = (client: IScopedClusterClient, name = '*') => {
  return client.asCurrentUser.indices.getDataStream({
    name,
    expand_wildcards: 'all',
  });
};

const getDataStreamsStats = (client: IScopedClusterClient, name = '*') => {
  return client.asCurrentUser.indices.dataStreamsStats({
    name,
    expand_wildcards: 'all',
    human: true,
  });
};

const getDataStreamsPrivileges = (client: IScopedClusterClient, names: string[]) => {
  return client.asCurrentUser.security.hasPrivileges({
    body: {
      index: [
        {
          names,
          privileges: ['delete_index', 'manage_data_stream_lifecycle'],
        },
      ],
    },
  });
};

export function registerGetAllRoute({ router, lib: { handleEsError }, config }: RouteDependencies) {
  const querySchema = schema.object({
    includeStats: schema.maybe(schema.oneOf([schema.literal('true'), schema.literal('false')])),
  });
  router.get(
    { path: addBasePath('/data_streams'), validate: { query: querySchema } },
    async (context, request, response) => {
      const { client } = (await context.core).elasticsearch;

      const includeStats = (request.query as TypeOf<typeof querySchema>).includeStats === 'true';

      try {
        const { data_streams: dataStreams } = await getDataStreams(client);

        let dataStreamsStats;
        let dataStreamsPrivileges;

        if (includeStats) {
          ({ data_streams: dataStreamsStats } = await getDataStreamsStats(client));
        }

        if (config.isSecurityEnabled() && dataStreams.length > 0) {
          dataStreamsPrivileges = await getDataStreamsPrivileges(
            client,
            dataStreams.map((dataStream) => dataStream.name)
          );
        }

        const enhancedDataStreams = enhanceDataStreams({
          dataStreams,
          dataStreamsStats,
          dataStreamsPrivileges,
        });

        return response.ok({ body: deserializeDataStreamList(enhancedDataStreams) });
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}

export function registerGetOneRoute({ router, lib: { handleEsError }, config }: RouteDependencies) {
  const paramsSchema = schema.object({
    name: schema.string(),
  });
  router.get(
    {
      path: addBasePath('/data_streams/{name}'),
      validate: { params: paramsSchema },
    },
    async (context, request, response) => {
      const { name } = request.params as TypeOf<typeof paramsSchema>;
      const { client } = (await context.core).elasticsearch;
      try {
        const [{ data_streams: dataStreams }, { data_streams: dataStreamsStats }] =
          await Promise.all([getDataStreams(client, name), getDataStreamsStats(client, name)]);

        if (dataStreams[0]) {
          let dataStreamsPrivileges;
          if (config.isSecurityEnabled()) {
            dataStreamsPrivileges = await getDataStreamsPrivileges(client, [dataStreams[0].name]);
          }

          const enhancedDataStreams = enhanceDataStreams({
            dataStreams,
            dataStreamsStats,
            dataStreamsPrivileges,
          });
          const body = deserializeDataStream(enhancedDataStreams[0]);
          return response.ok({ body });
        }

        return response.notFound();
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}
