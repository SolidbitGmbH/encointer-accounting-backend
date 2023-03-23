import { getRandomInt } from "./util.js";

function getRandomTransfer(cid, start, end) {
    return {
        id: "0-0",
        blockHeight: "0",
        timestamp: getRandomInt(start, end).toString(),
        arg0: cid,
        arg1: "",
        arg2: "",
        arg3: Math.random() * 30 + 10,
    };
}

function getRandomAddress() {
    if (Math.random() < 0.2) return 'Ho9hceO6Rovtg3GSlzZWoaMbqAaEntwxQk4tQC5d1R5DkD2E'
    var chars =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var address = "H";
    for (var i = 0; i <= 46; i++) {
        var randomNumber = Math.floor(Math.random() * chars.length);
        address += chars.substring(randomNumber, randomNumber + 1);
    }
    return address;
}

export function getRandomIncoming(address, cid, start, end) {
    const txn = getRandomTransfer(cid, start, end);
    txn.arg1 = getRandomAddress();
    txn.arg2 = address;
    console.log(txn)
    return txn
}

export function getRandomOutgoing(address, cid, start, end) {
    const txn = getRandomTransfer(cid, start, end);
    txn.arg1 = address;
    txn.arg2 = getRandomAddress();
    return txn
}

export function getRandomIssueds(address, cid, start, end) {
    return {
        id: "0-0",
        blockHeight: "0",
        timestamp: getRandomInt(start, end).toString(),
        arg0: cid,
        arg1: address,
        arg2: 44,
    };
}
