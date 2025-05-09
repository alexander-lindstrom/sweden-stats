import { buildScbApiRequestBody, JsonStat2Response, PopulationQueryArgs } from "@/util/scb";
import { baseApi } from "./BaseApi";

export const scbApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPopulationStatistics: builder.query<JsonStat2Response, PopulationQueryArgs>({
      query: (args) => ({
        url: `https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5444/data?outputFormat=json-stat2`,
        method: 'POST',
        body: buildScbApiRequestBody(args),
      }),
    }),
  }),
  overrideExisting: false, // Default is false, can be true if replacing existing endpoints
});

export const { useGetPopulationStatisticsQuery } = scbApi;
