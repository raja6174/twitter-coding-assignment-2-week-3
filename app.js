const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//API1 Register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const getUserQuery = `
    SELECT * 
    FROM
        USER
    WHERE 
        username = '${username}';
    `;
  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        INSERT INTO 
        user(username, password, name, gender)
        VALUES (
            '${username}', '${hashedPassword}', '${name}', '${gender}'
        );
    `;

      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2 Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getUserQuery = `
    SELECT * 
    FROM 
        user
    WHERE 
        username = '${username}';
    `;

  const dbUser = await db.get(getUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatch) {
      const jwtToken = jwt.sign(dbUser, "RAJA");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authenticate JwtToken
const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  const authHeader = request.headers["authorization"];
  let jwtToken;

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "RAJA", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//snake to camel case
const snakeToCamelCase = (dbObj) => {
  return {
    userId: dbObj.user_id,
    name: dbObj.name,
    username: dbObj.username,
    password: dbObj.password,
    gender: dbObj.gender,
    followerId: dbObj.follower_id,
    followerUserId: dbObj.follower_user_id,
    followingUserId: dbObj.following_user_id,
    tweetId: dbObj.tweet_id,
    tweet: dbObj.tweet,
    dateTime: dbObj.date_time,
    replyId: dbObj.reply_id,
    reply: dbObj.reply,
    likeId: dbObj.like_id,
  };
};

//API3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, user_id, gender } = request.payload;
  console.log(request.payload);
  const getTweetsQuery = `
    SELECT 
        username,tweet.tweet, tweet.date_time
    FROM
         follower
         INNER JOIN tweet ON follower.following_user_id = tweet.user_id
         INNER JOIN user ON user.user_id = tweet.user_id
         
    WHERE 
        follower.follower_user_id = ${user_id}
    ORDER BY 
        tweet.date_time DESC
    LIMIT 4
    `;

  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray.map((eachItem) => snakeToCamelCase(eachItem)));
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { name, username, user_id } = request.payload;
  const getFollowers = `
    SELECT name
    FROM
        user
    INNER JOIN 
        follower ON user.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id = ${user_id}
    `;

  const namesArr = await db.all(getFollowers);
  response.send(namesArr);
});

//API5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { name, username, user_id } = request.payload;
  const getFollowers = `
    SELECT name
    FROM
        user
    INNER JOIN 
        follower ON user.user_id = follower.follower_user_id
    WHERE 
        follower.following_user_id = ${user_id}
    `;

  const namesArr = await db.all(getFollowers);
  response.send(namesArr);
});

//API6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { user_id, username, name } = request.payload;
  const { tweetId } = request.params;
  const getTweet = `
    SELECT * 
    FROM
        tweet
    INNER JOIN
        follower ON following_user_id = tweet.user_id
    INNER JOIN
        user ON tweet.user_id = user.user_id
    WHERE 
        follower.follower_user_id = ${user_id} AND tweet_id = ${tweetId};
    `;

  const dbTweet = await db.get(getTweet);

  if (dbTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetails = `
    SELECT tweet, COUNT(DISTINCT(like_id)) AS likes,
    COUNT(DISTINCT(reply_id)) AS replies,
     tweet.date_time AS dateTime
    FROM
        tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id
        INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE 
        tweet.tweet_id = ${tweetId}
    `;

    const tweet = await db.get(getTweetDetails);
    response.send(tweet);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { user_id, username, name } = request.payload;
    const { tweetId } = request.params;
    const getTweet = `
    SELECT * 
    FROM
        tweet
    INNER JOIN
        follower ON following_user_id = tweet.user_id
    INNER JOIN
        user ON tweet.user_id = user.user_id
    WHERE 
        follower.follower_user_id = ${user_id} AND tweet_id = ${tweetId};
    `;

    const dbTweet = await db.get(getTweet);

    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getNames = `
      SELECT username
      FROM 
        like
      INNER JOIN user ON like.user_id = user.user_id
      WHERE 
        tweet_id = ${tweetId}
      `;

      const namesArr = await db.all(getNames);
      likes = namesArr.map((eachItem) => eachItem.username);
      response.send({ likes });
    }
  }
);

//API8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { user_id, username, name } = request.payload;
    const { tweetId } = request.params;
    const getTweet = `
    SELECT * 
    FROM
        tweet
    INNER JOIN
        follower ON following_user_id = tweet.user_id
    WHERE 
        follower.follower_user_id = ${user_id} AND tweet_id = ${tweetId};
    `;

    const dbTweet = await db.get(getTweet);

    if (dbTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getNames = `
      SELECT name, reply
      FROM 
        reply
      INNER JOIN user ON reply.user_id = user.user_id
      WHERE 
        tweet_id = ${tweetId}
      `;

      const namesArr = await db.all(getNames);
      replies = namesArr;
      response.send({ replies });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { user_id } = request.payload;
  const getTweets = `
    SELECT tweet, COUNT(DISTINCT(like_id)) AS likes,
    COUNT(DISTINCT(reply_id)) AS replies, tweet.date_time AS dateTime
    FROM tweet
    INNER JOIN 
        like ON like.tweet_id = tweet.tweet_id
    INNER JOIN 
        reply ON reply.tweet_id = tweet.tweet_id
    WHERE
        tweet.user_id = ${user_id}
    GROUP BY 
        tweet.tweet_id
   `;

  const tweets = await db.all(getTweets);
  response.send(tweets);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const createTweet = `
    INSERT INTO 
    tweet(tweet)
    VALUES (
        '${tweet}'
    );
    `;

  await db.run(createTweet);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id, username, name, gender } = request.payload;
    const getTweet = `
    SELECT * 
    FROM
        tweet 
    WHERE 
        user_id = ${user_id} AND tweet_id = ${tweetId};
    `;

    const tweet = await db.get(getTweet);

    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
        DELETE FROM 
        tweet
        WHERE 
            user_id = ${user_id} AND tweet_id = ${tweetId};
        `;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
