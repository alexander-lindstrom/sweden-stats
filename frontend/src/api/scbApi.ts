import { baseApi } from "./BaseApi";

export const scbApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
      
      getLatestMonthlyPopulation: builder.query<string, void>({
        query: () => ({
          url: 'https://api.scb.se/OV0104/v2beta/api/v2/tables/TAB5444/data',
          method: 'POST',
          body: {
            query: [
              {
                code: "region",
                selection: {
                  filter: "all",
                  values: ["*"]
                }
              },
              {
                code: "ålder",
                selection: {
                  filter: "all",
                  values: ["*"]
                }
              },
              {
                code: "kön",
                selection: {
                  filter: "all",
                  values: ["*"]
                }
              },
              {
                code: "månad",
                selection: {
                  filter: "item",
                  values: ["2024M12"]
                }
              }
            ],
            response: {
              format: "json-stat2" 
            }
          },
        }),
      }),
    }),
  });

export const { useGetLatestMonthlyPopulationQuery } = scbApi;
