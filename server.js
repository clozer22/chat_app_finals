const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const cookieParser = require('cookie-parser')
const session = require('express-session')
const bcrypt = require('bcrypt')

const app = express();
app.use(express.json())
app.use(cookieParser())
const PORT = process.env.PORT || 5000;

app.use(bodyParser.urlencoded({ extended: true }))

app.use(
  cors({
    origin: ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  })
)

const pool = mysql
  .createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chat_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  })
  .promise()



app.use(
  session({
    key: 'userID',
    secret: 'loggedin',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
    // cookie: {
    //     maxAge: 60 * 60 * 24,
    // }
  })
)

app.post('/messages', async(req, res) => {
  const { sender, recipient, message } = req.body;
  try{
    const sql = 'INSERT INTO tbl_message (sender_id, receiver_id, message, last_message) VALUES (?, ?, ?, ?)';
    pool.query(sql, [sender, recipient, message, sender], (err, result) => {
      if (err) {
        console.error('Error inserting message:', err);
        res.status(500).json({ error: 'Error inserting message' });
        return;
      }
      console.log('Message inserted:', result);
      res.json({ message: 'Message sent successfully' });
    });
  }catch(error){
    console.error(error)
    res.status(500).json({ error: 'Interval error' });
  }
  
});



app.get('/messages/:recipientId/:senderId', async(req, res) => {
  const recipientId = req.params.recipientId;
  const senderId = req.params.senderId;
  const [sql] = await pool.query('SELECT * FROM tbl_message WHERE (receiver_id = ? AND sender_id = ?) OR (receiver_id = ? AND sender_id = ?)', [recipientId, senderId, senderId, recipientId]);
    if (sql.length === 0) {
      res.status(500).json({ error: 'Error retrieving messages' });
      return;
    }else{
      res.json(sql);
    }
});

app.get('/user', async(req, res) => {
  const sql = "SELECT * FROM tbl_users";
  if(sql.length > 0){
     console.log("tangina meron")
     res.json({message: "tanginaaa meron"})
  }else{
     console.log("asdasdas")
     res.json({message: "tanginaaa walaaa"})
  }
})

// app.get('/contacts/:userId/', (req, res) => {
//     const userId = req.params.userId;
//     const sql = 'SELECT * FROM tbl_message WHERE receiver_id = ? AND sender_id = ?';
//     pool.query(sql, [senderId], (err, results) => {
//       if (err) {
//         console.error('Error retrieving messages:', err);
//         res.status(500).json({ error: 'Error retrieving messages' });
//         return;
//       }
//       res.json(results);
//     });
//   });



app.post('/register', async (req, res) => {
  const { firstName, lastName, userName, password } = req.body;

  try {
    const [check] = await pool.query("SELECT * FROM tbl_users WHERE user_name = ?", [userName]);

    if (check.length > 0) {
      return res.status(200).json({ message: 'Username is already exist' });
    } else {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      await pool.query("INSERT INTO tbl_users (first_name, last_name, user_name, password) VALUES (?,?,?,?)", [firstName, lastName, userName, hash]);

      res.status(200).json({ message: 'User registered successfully', userName: userName });
    }
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.post('/login', async (req, res) => {
  const { userName, password } = req.body;
  try {
    const [check] = await pool.query("SELECT * FROM tbl_users WHERE user_name = ?", [userName]);

    if (check.length === 0) {
      console.log("tarantado")
      res.status(200).json({ message: "Username is not exist" })
      return;
    } else {
      bcrypt.compare(password, check[0].password, async (err, response) => {
        if (response) {
          const update = pool.query("UPDATE tbl_users SET status = ? WHERE user_id = ?", ['Active Now', check[0].user_id]);

          if (update) {
            req.session.user = check
            res.status(200).json({ message: "Successfully login", userInfo: check[0] });
          } else {
            res.status(400).json({ message: "May mali sa pag login" })
          }
        } else {
          return res.status(200).json({
            message: 'Wrong username/password combination!',
            userInfo: check[0],
          })
        }
      })

    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' })
  }

})





app.get('/getUsers/:id', async (req, res) => {
  const { id } = req.params;

  const [users] = await pool.query("SELECT a.user_id, a.friend_user_id, b.* FROM ( SELECT user_id, friend_user_id FROM tbl_friends_list UNION SELECT friend_user_id, user_id FROM tbl_friends_list ) as a LEFT JOIN tbl_users b ON a.friend_user_id = b.user_id WHERE a.user_id = ?", [id])
    if (users.length === 0) {
      return res.status(400).json({ message: "No users" });
    } else {
      return res.status(200).json({ message: "Successfully get all the users", users: users });
    }
});


// LOGOUT

app.post('/logout', async(req, res) => {
  const {userId} = req.body
  try{
    const update = await pool.query("UPDATE tbl_users SET status = 'Offline' WHERE user_id = ?" , [userId]);

    if(update){
      req.session.destroy(err => {
      if(err){
        console.log(err)
      }else{
        res.clearCookie('userID'); 
        res.status(200).json({message: "Logged out successfully"});
      }
      });
    }else{
      res.status(400).json({message:"Failed to logout"});
    }
  }catch(error){
    console.error(error)
  }
})


app.post("/sendFriendRequest", async(req, res) => {
  const {userId, userName, sentUserId} = req.body;
  try{
    const [checking1] = await pool.query("SELECT * FROM tbl_users WHERE user_id = ? AND user_name = ?", [sentUserId, userName]);

    if(checking1.length === 0){
      res.json({message: "That user is not exist."})
      return;
    }else{
      const [checking2] = await pool.query("SELECT * FROM tbl_friends_list WHERE (user_id = ? AND friend_user_id = ?) OR (user_id = ? AND friend_user_id = ?)", [userId, sentUserId, sentUserId, userId]);

      if(checking2.length > 0){
        res.json({message: "That user is already your friend."})
        return;
      }else{
        const addUser = await pool.query("INSERT INTO tbl_friends_list (user_id, friend_user_id) VALUES (?,?)",[userId, sentUserId]);
  
        if(addUser){
          console.log("FRIEND REQ SENT")
          res.status(200).json({message: "Successfully sent"})
          return;
        }else{
          console.log("FRIEND REQ SENT FAILED")
          res.status(400).json({message: "failed to sent"})
          return;
        }
      }
    }
  }catch(error){
    console.log(error)
  }
})


app.get("/getUserData/:user_id", async(req,res) => {
  const {user_id} = req.params;

  const [select] = await pool.query("SELECT * FROM tbl_users WHERE user_id = ? ", [user_id]);

  if(select.length > 0){
    res.status(200).json({message: "Successfully fetch current user info", user_data: select});
    return;
  }else{
    res.status(400).json({message:"failed to fetch info of the current user"});
    return;
  }
})


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
