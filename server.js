import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import FacebookStrategy from "passport-facebook";
import env from "dotenv";
import axios from "axios";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app=express();
const port=3000;
const saltrounds=5;
env.config();
app.use(express.static("public"));
app.set("view engine", "ejs")
app.use(
  session({
   secret: process.env.SESSION_SECRET,
   resave: false,
   saveUninitialized: true,
})
);
//middle wares
app.use(passport.initialize());
app.use(passport.session());

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
//connecting the postgres db
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: 5432,
});
db.connect();
//get the files of home page
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/main.html");
});

//get the files of the joke page
app.get("/joke",async (req, res) => {
  console.log("Session Data:", req.session); 
  console.log("User Data:", req.user);
  console.log(req.user);
  if(req.isAuthenticated()){
    try{
    const response=await axios.get("https://v2.jokeapi.dev/joke/Any");//Open API use
    console.log(response);
    const data = response.data;
    const jokeText = data.joke || (data.setup + " " + data.delivery);
    const userId = req.user;
    const favCheck = await db.query(
      "SELECT 1 FROM favorites WHERE user_id = $1 AND joke = $2",
      [userId, jokeText]
    );
    const result= await db.query("Select username from users where id=$1",[userId]);
    const user=result.rows[0].username;
    const isFavorited = favCheck.rows.length > 0;
    res.render("joke.ejs",{data: response.data,isFavorited,user});
    }
    catch(error){
     console.error("Failed to make request",error.message);
     res.sendStatus(500).send("failed to fetch activity");
    }
  }else{
 res.redirect("/");
  }
});

//using the facebook strategy authentication
app.get("/auth/facebook",passport.authenticate("facebook",{
  scope: ["public_profile","email"]
})
);
//using the facebook strategy logins the page after successful authentication 
app.get("/auth/facebook/joke",passport.authenticate("facebook",{
  successRedirect:"/joke",
  failureRedirect:"/",
})
);

//using the facebook strategy authentication
app.get("/auth/google",passport.authenticate("google",{
  scope: ["profile","email"],
})
);
//using the google strategy authentication
app.get("/auth/google/joke",passport.authenticate("google",{
  successRedirect:"/joke",
  failureRedirect:"/",
})
);
//for the logut button
app.get("/logout",(req,res)=>{
  req.logOut((err)=>{
   if(err) console.log(err);
   res.redirect("/");
  });
});
//generates new joke again
app.get("/new-joke",(req,res)=>{
   res.redirect("/joke");
});
//using local strategy 
app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/joke",
    failureRedirect: "/",
  })
);
//for the register button
app.post("/register",async (req,res) => {
   console.log(req.body);
   const username=req.body.Username;
   const email=req.body.email;
   const password=req.body.password;
  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (checkResult.rows.length > 0) {
      res.send("Email already exists. Try logging in.");
    } else {
      //password hashing
      bcrypt.hash(password,saltrounds,async (err,hash)=>{
        if(err) {console.log(err);}
        else{
          await db.query("INSERT INTO users(username,email,password) values($1,$2,$3)",[username,email,hash]);
          const response=await axios.get("https://v2.jokeapi.dev/joke/Any");//Open API use
          console.log(response);
          const data = response.data;
          const jokeText = data.joke || (data.setup + " " + data.delivery);
          const userId = req.user;
          const favCheck = await db.query(
            "SELECT 1 FROM favorites WHERE user_id = $1 AND joke = $2",
            [userId, jokeText]
          );
          const user=username;
          const isFavorited = favCheck.rows.length > 0;
          res.render("joke.ejs",{data: response.data,isFavorited,user});
        }
      })
    }
  } catch (err) {
    console.log(err);
  }
});

// local strategy using passport-local
passport.use("local",new Strategy(async function verify(username, password, done){
  console.log("Inside verify function - username:", username);
  try {
    const checkresult=await db.query("Select * from users where username=$1",[username]);
    if(checkresult.rows.length > 0){
        const storeduser=checkresult.rows[0];
        const storedpass=storeduser.password;
       // console.log(storedpass);
       bcrypt.compare(password,storedpass,(err,result)=>{
        if(err){
          return done(err);
        }
         else{
          if(result) 
            {return done(null,storeduser);}
          else {
            return done(null,false, { message: "Incorrect password" });
          }
          }
      });
    }
    else{ 
      return done(null, false, { message: "User not found" });
    }
} catch (error) {
    return done(error);
}
}));

//setting up the authentication middleware using pssport-google
passport.use("google",new GoogleStrategy({
clientID:process.env.GOOGLE_CLIENT_ID,
clientSecret:process.env.GOOGLE_CLIENT_SECRET,
callbackURL:"http://localhost:3000/auth/google/joke",
userProfileURL:"https://www.googleapis.com/oauth2/v3/userinfo"
},async (accessToken,refreshToken,profile, cb) =>{
 // console.log(profile);
  try {
  const result=await db.query("Select * from users where email=$1",[profile.email]);
  if(result.rows.length === 0){
    const newUser=await db.query("INSERT INTO users(username,email,password) values($1,$2,$3) RETURNING *",[profile.given_name,profile.email,"google"]);
    cb(null, newUser.rows[0]);
  } else{
    //already having existing user
    cb(null,result.rows[0]);
  }
  } catch (error) {
    cb(error);
  }
})
);

//facebook strategy using passport-facebook
passport.use("facebook",new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: "http://localhost:3000/auth/facebook/joke",
},async (accessToken,refreshToken,profile, cb) =>{
 console.log(profile);
 try {
  const result=await db.query("Select * from users where email=$1",[profile.id]);
  if(result.rows.length === 0){
    const newUser=await db.query("INSERT INTO users(username,email,password) values($1,$2,$3) RETURNING *",[profile.displayName,profile.id,"facebook"]);
    cb(null, newUser.rows[0]);
  } else{
    //already having existing user
    cb(null,result.rows[0]);
  }
 } catch (error) {
   cb(error);
 }
})
);

//fetching the data for favorite click
app.post("/favorite", async (req, res) => {
  const joke= req.body.joke;
  const userId = req.user;
  console.log(joke);
  console.log(userId);
  try {
      await db.query(
          "INSERT INTO favorites (user_id, joke) VALUES ($1, $2)",
          [userId, joke]
      );
      res.sendStatus(200);
  } catch (err) {
      console.error("Error saving favorite:", err);
      res.sendStatus(500);
  }
});
//removal of favourite from the db
app.post("/remove-favorite", async (req, res) => {
  const joke = req.body.joke;
  const userId = req.user;
  try {
      await db.query(
          "DELETE FROM favorites WHERE user_id = $1 AND joke = $2",
          [userId, joke]
      );
      res.sendStatus(200);
  } catch (err) {
      console.error("Error removing favorite:", err);
      res.sendStatus(500);
  }
});


//shows the favorite jokes of the user from the db
app.get("/favs", async (req, res) => {
  const userId = req.user;
  try {
      const result = await db.query(
          "SELECT joke FROM favorites WHERE user_id = $1",
          [userId]
      );
      res.render("fav.ejs", { jokes: result.rows });
  } catch (err) {
      console.error("Error fetching favorites:", err);
      res.sendStatus(500);
  }
});
//serialising
passport.serializeUser((user,done)=>{
  console.log("Serializing user:", user.id); // Debugging
  done(null, user.id); // Store only user ID in session
});
//deserialising
passport.deserializeUser((user,done)=>{
  done(null, user);
});


//listening port
app.listen(port,(req,res)=>{
 console.log(`Litening server on port:${port}`)
});