import { parseEncointerBalance } from "@encointer/types";
import { INDEXER_ENDPOINT } from "./consts.js";
import fetch from "node-fetch";

const INCOMING = 2;
const OUTGOING = 1;

async function graphQlQuery(query, variables) {
    let res = await fetch(INDEXER_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            query,
            variables,
        }),
    });
    if (!res.ok) console.log(await res.text());
    return (await res.json()).data;
}

async function getClosestBlock(timestamp) {
    const query = `query Query($timestamp: BigFloat!){
        blocks(filter: {timestamp: {lessThanOrEqualTo:$timestamp}}, orderBy: TIMESTAMP_DESC, first:1) {
          nodes {
          blockHeight
          }
        }
      }`;

    return graphQlQuery(query, { timestamp });
}

export async function getAllTransfers(start, end, cid) {
    const query = `query Query($start: BigFloat!, $end: BigFloat!, $cid: String!, $after: Cursor!){
      transferreds(filter: {timestamp: {greaterThanOrEqualTo:$start, lessThanOrEqualTo:$end}, arg0: {equalTo: $cid} }, orderBy: TIMESTAMP_ASC, after: $after) {
        nodes {
        id
        blockHeight
        timestamp
        arg0
        arg1
        arg2
        arg3
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }`;

    return getAllPages(query, { start, end, cid });
}

async function getTransfers(start, end, address, cid, direction) {
    const query = `query Query($address: String!, $start: BigFloat!, $end: BigFloat!, $cid: String!, $after: Cursor!){
      transferreds(filter: {arg${direction}: { equalTo: $address }, timestamp: {greaterThanOrEqualTo:$start, lessThanOrEqualTo:$end}, arg0: {equalTo: $cid} }, orderBy: TIMESTAMP_ASC, after: $after) {
        nodes {
        id
        blockHeight
        timestamp
        arg0
        arg1
        arg2
        arg3
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }`;

    return getAllPages(query, { address, start, end, cid });
}

async function getIssues(start, end, address, cid) {
    const query = `query Query($address: String!, $start: BigFloat!, $end: BigFloat!, $cid: String!, $after: Cursor!){
        issueds(filter: {arg1: { equalTo: $address }, timestamp: {greaterThanOrEqualTo:$start, lessThanOrEqualTo:$end}, arg0: {equalTo: $cid} }, orderBy: TIMESTAMP_ASC, after: $after) {
          nodes {
          id
          blockHeight
          timestamp
          arg0
          arg1
          arg2
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }`;

    return getAllPages(query, { address, start, end, cid });
}

export async function getAllIssues(cid) {
    const query = `query Query($cid: String!, $after: Cursor!){
      issueds(filter: {arg0: {equalTo: $cid} }, orderBy: TIMESTAMP_ASC, after: $after) {
        nodes {
        id
        blockHeight
        timestamp
        arg0
        arg1
        arg2
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }`;

    return getAllPages(query, { cid });
}

export async function getRewardsIssueds(cid) {
    const query = `query Query($cid: String!, $after: Cursor!){
        rewardsIssueds(filter: {arg0: {equalTo: $cid} }, orderBy: TIMESTAMP_DESC, after: $after) {
            nodes {
            id
            blockHeight
            timestamp
            arg0
            arg1
            arg2
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
      }`;

    return getAllPages(query, { cid });
}

async function getBlocksByBlockHeights(heights) {
    const query = `query Query{
    blocks(filter: {blockHeight: {in:${JSON.stringify(heights)}} }) {
          nodes {
          id
          blockHeight
          timestamp
          cindex
          phase
          }
        }
      }`;

    return (await graphQlQuery(query)).blocks.nodes;
}

export async function getReputableRegistrations(cid) {
    const query = `query Query($cid: String!, $after: Cursor!){
    participantRegistereds(filter: {arg0: {equalTo: $cid}, arg1: {in: ["Reputable","Bootstrapper"]} }, after: $after) {
        nodes {
        id
        blockHeight
        timestamp
        arg0
        arg1
        arg2
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
  }`;

    return getAllPages(query, { cid });
}

export async function getAllPages(query, variables) {
    let response, data;
    const result = [];
    variables.after = "";
    do {
        response = await graphQlQuery(query, variables);
        data = Object.values(response)[0];
        result.push(...data.nodes);
        variables.after = data?.pageInfo?.endCursor;
    } while (data?.pageInfo?.hasNextPage);

    return result;
}

export async function gatherTransactionData(start, end, address, cid) {
    let incoming = await getTransfers(start, end, address, cid, INCOMING);
    const outgoing = await getTransfers(start, end, address, cid, OUTGOING);

    // hack to exclude cid fuckup transactions
    // const excludeEvents = ["1064499-1161", "820314-1", "819843-1", "1064499-275"];
    //  incoming = incoming.filter((e) => !excludeEvents.includes(e.id));

    const issues = await getIssues(start, end, address, cid);

    const sumIssues = issues.reduce((acc, cur) => acc + cur.arg2, 0);
    const sumIncoming = incoming.reduce((acc, cur) => acc + cur.arg3, 0);
    const sumOutgoing = outgoing.reduce((acc, cur) => acc + cur.arg3, 0);

    const numDistinctClients = new Set(incoming.map((e) => e.arg1)).size;
    return [
        incoming,
        outgoing,
        issues,
        sumIncoming,
        sumOutgoing,
        sumIssues,
        numDistinctClients,
    ];
}

export async function getBlockNumberByTimestamp(timestamp) {
    let block = (await getClosestBlock(timestamp)).blocks.nodes[0];
    const blockNumber = block.blockHeight;
    return blockNumber;
}

export async function getTransactionVolume(cid, start, end) {
    return (await getAllTransfers(start, end, cid)).reduce(
        (acc, cur) => acc + cur.arg3,
        0
    );
}

const blockCache = {};
export async function getAllBlocksByBlockHeights(heights) {
    const result = [];
    const remainingHeights = [];
    heights.forEach((h) => {
        if (h in blockCache) {
            result.push(blockCache[h]);
        } else {
            remainingHeights.push(h);
        }
    });
    for (let i = 0; i < remainingHeights.length; i += 10) {
        let blocks = await getBlocksByBlockHeights(
            remainingHeights.slice(i, i + 10)
        );
        blocks.forEach((b) => (blockCache[b.blockHeight] = b));
        result.push(...blocks);
    }
    return result;
}
