

const { MongoClient, ServerApiVersion } = require("mongodb");

const uri =
  "mongodb://prajaktagavhane372_db_user:saZdOQae5YWQWWog@ac-ygupyxw-shard-00-00.8z1uhrr.mongodb.net:27017,ac-ygupyxw-shard-00-01.8z1uhrr.mongodb.net:27017,ac-ygupyxw-shard-00-02.8z1uhrr.mongodb.net:27017/?ssl=true&replicaSet=atlas-w4vl57-shard-0&authSource=admin&retryWrites=true&w=majority";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected!");
    await client.db("admin").command({ ping: 1 });
    console.log("Ping successful!");
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();