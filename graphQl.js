import { INDEXER_ENDPOINT } from "./consts.js";
import fetch from "node-fetch";

const INCOMING = 2;
const OUTGOING = 1;

// ausgleichstransaktionen bei cid wechsel müssen ignoriert werden
const excludeEvents = ["1064499-1161", "820314-1", "819843-1", "1064499-275"];


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
    return (await res.json()).data;
}

async function getTransfers(start, end, address, direction) {
    const query = `query Query($address: String!, $start: BigFloat!, $end: BigFloat!){
        transferreds(filter: {arg${direction}: { equalTo: $address }, timestamp: {greaterThanOrEqualTo:$start, lessThanOrEqualTo:$end}, arg0: {in: ["u0qj92QX9PQ", "u0qj9QqA2Q", "u0qj944rhWE"]} }, orderBy: TIMESTAMP_ASC) {
          nodes {
          id
          blockHeight
          timestamp
          arg0
          arg1
          arg2
          arg3
          }
        }
      }`;

    return graphQlQuery(query, { address, start, end });
}

async function getIssues(start, end, address) {
    const query = `query Query($address: String!, $start: BigFloat!, $end: BigFloat!){
        issueds(filter: {arg1: { equalTo: $address }, timestamp: {greaterThanOrEqualTo:$start, lessThanOrEqualTo:$end}, arg0: {in: ["u0qj92QX9PQ", "u0qj9QqA2Q", "u0qj944rhWE"]} }, orderBy: TIMESTAMP_ASC) {
          nodes {
          id
          blockHeight
          timestamp
          arg0
          arg1
          arg2
          }
        }
      }`;

    return graphQlQuery(query, { address, start, end });
}

export async function gatherTransactionData(start, end, address, cid) {
    let incoming = (await getTransfers(start, end, address, INCOMING))
        .transferreds.nodes;
    const outgoing = (await getTransfers(start, end, address, OUTGOING))
        .transferreds.nodes;

    // hack to exclude cid fuckup transactions
    incoming = incoming.filter((e) => !excludeEvents.includes(e.id));

    const issues = (await getIssues(start, end, address)).issueds.nodes;

    const sumIssues = issues.reduce((acc, cur) => acc + cur.arg2, 0);

    const sumIncoming = incoming.reduce((acc, cur) => acc + cur.arg3, 0);
    const sumOutgoing = outgoing.reduce((acc, cur) => acc + cur.arg3, 0);
    const incomeMinusExpenses = sumIncoming - sumOutgoing;

    const numDistinctClients = new Set(incoming.map(e => e.arg1)).size
    return [incoming, outgoing, issues, incomeMinusExpenses, sumIssues, numDistinctClients];
}

export function generateTxnLog(incoming, outgoing, issues) {
    const incomingLog = incoming.map((e) => ({
        timestamp: e.timestamp,
        counterParty: e.arg1,
        amount: e.arg3,
    }));
    const outgoingLog = outgoing.map((e) => ({
        timestamp: e.timestamp,
        counterParty: e.arg2,
        amount: -e.arg3,
    }));
    const issuesLog = issues.map((e) => ({
        timestamp: e.timestamp,
        counterParty: "ISSUANCE",
        amount: e.arg2,
    }));
    const txnLog = incomingLog.concat(outgoingLog).concat(issuesLog);
    txnLog.sort((a, b) => parseInt(a.timestamp) - parseInt(b.timestamp));
    return txnLog;
}
