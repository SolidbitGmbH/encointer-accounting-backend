import { parseEncointerBalance } from "@encointer/types";
import { ACCOUNTS, CIDS } from "./consts.js";
import { gatherTransactionData, generateTxnLog } from "./graphQl.js";

const LAST_BLOCK_OF_MONTH_CACHE = {};

const cids = ["u0qj944rhWE", "u0qj9QqA2Q", "u0qj92QX9PQ"];
const cidsDecoded = [
    { geohash: "u0qj9", digest: "0x36fc80f3" },
    { geohash: "u0qj9", digest: "0x1012ea85" },
    { geohash: "u0qj9", digest: "0x77f79df7" },
];

async function getBlockTimestamp(api, blockNumber) {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    return api.query.timestamp.now.at(blockHash);
}
// perform a binary search over all blocks to find the closest block below the timestamp
export async function getBlockNumber(api, timestamp) {
    const currentBlockNumber = (
        await api.rpc.chain.getBlock()
    ).block.header.number.toNumber();

    let low = 0;
    let high = currentBlockNumber;

    while (high - low > 1) {
        let middle = Math.floor((low + high) / 2);
        if (timestamp < (await getBlockTimestamp(api, middle))) high = middle;
        else low = middle;
    }
    return low;
}

async function getBalance(api, cid, address, at) {
    const balanceEntry = await api.query.encointerBalances.balance.at(
        at,
        cid,
        address
    );
    return {
        principal: parseEncointerBalance(balanceEntry.principal.bits),
        lastUpdate: balanceEntry.lastUpdate.toNumber(),
    };
}

export async function getDemurragePerBlock(api, cid, at) {
    const demurragePerBlock =
        await api.query.encointerBalances.demurragePerBlock.at(at, cid);
    return parseEncointerBalance(demurragePerBlock.bits);
}

function getLastTimeStampOfMonth(year, monthIndex) {
    return new Date(
        Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)
    ).getTime();
}

function getFirstTimeStampOfMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex)).getTime();
}

export async function getLastBlockOfMonth(api, year, monthIndex) {
    const lastBlocksOfMonth2022 = [
        156172, 293070, 405492, 518227, 682654, 842429, 996273, 1164725, 1364285,
        1580906, 1791306, 1972772,
    ];
    return lastBlocksOfMonth2022[monthIndex]
}

export function applyDemurrage(principal, elapsedBlocks, demurragePerBlock) {
    return principal * Math.exp(-demurragePerBlock * elapsedBlocks);
}

async function getDemurrageAdjustedBalance(api, address, blockNumber) {
    const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
    let cidBalanceEntry = (
        await Promise.all(
            cidsDecoded.map(async (cid) => [
                cid,
                await getBalance(api, cid, address, blockHash),
            ])
        )
    ).filter((e) => e[1].principal > 0)[0];

    let balance = 0;
    if (cidBalanceEntry) {
        const cid = cidBalanceEntry[0];
        const balanceEntry = cidBalanceEntry[1];

        const demurragePerBlock = await getDemurragePerBlock(
            api,
            cid,
            blockHash
        );
        balance = applyDemurrage(
            balanceEntry.principal,
            blockNumber - balanceEntry.lastUpdate,
            demurragePerBlock
        );
    }
    return balance;
}

function getDateString(timestamp) {
    return new Date(parseInt(timestamp)).toUTCString().replace(",", "");
}

export function validateAccountToken(account, token) {
    return ACCOUNTS[account].token === token;
}

export async function getAccountingData(api, account, cid, year, month) {
    const start = getFirstTimeStampOfMonth(year, month);
    const end = getLastTimeStampOfMonth(year, month);
    const lastBlockOfMonth = await getLastBlockOfMonth(api, year, month);
    const lastBlockOfPreviousMonth = await getLastBlockOfMonth(
        api,
        year,
        month - 1
    );

    const [
        incoming,
        outgoing,
        issues,
        incomeMinusExpenses,
        sumIssues,
        numDistinctClients,
    ] = await gatherTransactionData(start, end, account, cid);

    const txnLog = generateTxnLog(incoming, outgoing, issues);

    const balance = await getDemurrageAdjustedBalance(
        api,
        account,
        lastBlockOfMonth
    );
    const previousBalance = await getDemurrageAdjustedBalance(
        api,
        account,
        lastBlockOfPreviousMonth
    );

    return {
        month,
        incomeMinusExpenses,
        sumIssues,
        balance,
        numIncoming: incoming.length,
        numOutgoing: outgoing.length,
        numIssues: issues.length,
        numDistinctClients,
        costDemurrage:
            previousBalance + incomeMinusExpenses + sumIssues - balance,
        txnLog,
    };
}
