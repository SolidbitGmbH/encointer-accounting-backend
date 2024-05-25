import express from "express";

import accounting from "./accounting.js";
import auth from "./auth.js";
import communities from "./communities.js";
import indexer2 from "./indexer2.js";


const v1 = express.Router();

v1.use("/accounting", accounting);

v1.use("/auth", auth);
v1.use("/communities", communities);
v1.use("/indexer2", indexer2);

export default v1;
