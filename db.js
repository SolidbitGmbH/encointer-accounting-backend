import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";
import { getRandomPassword } from "./util.js";

class Database {
    constructor() {
        this.dbClient = new MongoClient(process.env.DB_URL, {
            ssl: true,
            sslValidate: true,
        });
        this.dataCache = this.dbClient.db("data_cache");
        this.accountData = this.dataCache.collection("account_data");
        this.rewardsData = this.dataCache.collection("rewards_data");

        this.main = this.dbClient.db("main");
        this.users = this.main.collection("users");
        this.communities = this.main.collection("communities");
    }

    async insertIntoAccountDataCache(account, year, month, cid, data) {
        await this.accountData.replaceOne(
            { account, year, month, cid },
            { account, year, month, cid, data },
            {
                upsert: true,
            }
        );
    }

    async getFromAccountDataCache(account, year, cid) {
        return (
            await (await this.accountData.find({ account, year, cid })).toArray()
        ).map((e) => e.data);
    }

    async insertIntoRewardsDataCache(cid, data) {
        await this.rewardsData.replaceOne(
            { cid },
            { cid, data },
            {
                upsert: true,
            }
        );
    }

    async getFromRewardsDataCache(cid) {
        return this.rewardsData.findOne({ cid });
    }

    async checkUserCredentials(address, password) {
        const user = await this.users.findOne({ address });
        if (!user) return null;
        if (await bcrypt.compare(password, user.passwordHash)) return user;
        return null
    }

    async upsertUser(address, password, name, isAdmin = false) {
        await this.users.replaceOne(
            { address },
            {
                address,
                name,
                passwordHash: await bcrypt.hash(password, 10),
                isAdmin,
            },
            {
                upsert: true,
            }
        );
    }

    async setPassword(address, password) {
        await this.users.updateOne(
            { address },
            { $set: { passwordHash: await bcrypt.hash(password, 10) } }
        );
    }

    async addUserToCommunities(address, cids) {
        await this.communities.updateMany(
            { cid: { $in: cids } },
            { $push: { accounts: address } }
        );
    }

    async removeUserFromAllCommunities(address) {
        await this.communities.updateMany({}, { $pull: { accounts: address } });
    }

    async createUser(address, name, cids) {
        if (await this.getUser(address)) throw Error("User Exists");
        const password = getRandomPassword();
        this.upsertUser(address, password, name);
        this.addUserToCommunities(address, cids);
        return password;
    }

    async deleteUser(address) {
        await this.users.deleteOne({ address });
        await this.removeUserFromAllCommunities(address);
    }

    async getUser(address) {
        return this.users.findOne(
            { address },
            { projection: { address: 1, name: 1, isAdmin: 1, _id: 0 } }
        );
    }

    async updateUser(address, name, cids) {
        await this.users.updateOne({ address }, { $set: { name } });
        await this.removeUserFromAllCommunities(address);
        await this.addUserToCommunities(address, cids);
    }

    async getAllUsers() {
        return this.users
            .find(
                {},
                { projection: { address: 1, name: 1, isAdmin: 1, _id: 0 } }
            )
            .toArray();
    }

    async getCommunityUsers(cid) {
        const community = await this.getCommunity(cid);
        return this.users
            .find({ address: { $in: community.accounts } })
            .toArray();
    }

    async getCommunity(cid) {
        return this.communities.findOne({ cid });
    }

    async getAllCommunities() {
        return this.communities
            .find({}, { projection: { cid: 1, name: 1, _id: 0 } })
            .toArray();
    }
}

const db = new Database();
export default db;
