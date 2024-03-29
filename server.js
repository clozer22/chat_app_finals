const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
require('dotenv').config()
const mysql = require('mysql2')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const bcrypt = require('bcrypt')
const multer = require('multer');
const path = require('path');


const app = express()
app.use(express.json())
app.use(cookieParser())
const PORT = process.env.PORT

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
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
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

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploaded_img/'); // Specify the destination folder
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Use the original filename
  }
});

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 } // Set file size limit if needed
});

app.use('/uploaded_img', express.static(path.join(__dirname, 'uploaded_img')));


// SEND MESSAGE TO RECIPIENT
app.post('/messages', async (req, res) => {
  const { sender, recipient, message } = req.body
  try {
    const sql =
      'INSERT INTO tbl_message (sender_id, receiver_id, message, last_message) VALUES (?, ?, ?, ?)'
    pool.query(sql, [sender, recipient, message, sender], (err, result) => {
      if (err) {
        console.error('Error inserting message:', err)
        res.status(500).json({ error: 'Error inserting message' })
        return
      }
      console.log('Message inserted:', result)
      res.json({ message: 'Message sent successfully' })
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Interval error' })
  }
})


// GET ALL THE MESSAGES BETWEEN THE SENDER AND RECIPIENT
app.get('/messages/:recipientId/:senderId', async (req, res) => {
  const recipientId = req.params.recipientId
  const senderId = req.params.senderId
  const [sql] = await pool.query(
    'SELECT * FROM tbl_message WHERE (receiver_id = ? AND sender_id = ?) OR (receiver_id = ? AND sender_id = ?) AND is_deleted = "N"',
    [recipientId, senderId, senderId, recipientId]
  )
  if (sql.length === 0) {
    res
      .status(200)
      .json({ message: 'Error retrieving messages', messageData: sql })
    return
  } else {
    res.status(200).json({ message: 'messages fetched', messageData: sql })
  }
})

// GET THE USER INFO
app.get('/user', async (req, res) => {
  const [sql] = await pool.query('SELECT * FROM tbl_users')
  if (sql.length > 0) {
    console.log('tangina meron')
    res.json({ message: 'tanginaaa meron', result: sql })
  } else {
    console.log('asdasdas')
    res.json({ message: 'tanginaaa walaaa' })
  }
})

// CREATE ACCOUNT
app.post('/register', async (req, res) => {
  const { firstName, lastName, userName, password } = req.body

  try {
    const [check] = await pool.query(
      'SELECT * FROM tbl_users WHERE user_name = ?',
      [userName]
    )

    if (check.length > 0) {
      return res.status(200).json({ message: 'Username is already exist' })
    } else {
      const salt = await bcrypt.genSalt(10)
      const hash = await bcrypt.hash(password, salt)

      await pool.query(
        'INSERT INTO tbl_users (first_name, last_name, user_name, password, profile_img, cover_img) VALUES (?,?,?,?,?,?)',
        [
          firstName,
          lastName,
          userName,
          hash,
          'defaultPic.png',
          'defaultPic.png'
        ]
      )

      res
        .status(200)
        .json({ message: 'User registered successfully', userName: userName })
    }
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})



// LOGIN
app.post('/login', async (req, res) => {
  const { userName, password } = req.body
  try {
    const [check] = await pool.query(
      'SELECT * FROM tbl_users WHERE user_name = ?',
      [userName]
    )

    if (check.length === 0) {
      console.log('tarantado')
      res.status(200).json({ message: 'Username is not exist' })
      return
    } else {
      bcrypt.compare(password, check[0].password, async (err, response) => {
        if (response) {
          const update = pool.query(
            'UPDATE tbl_users SET status = ? WHERE user_id = ?',
            ['Active Now', check[0].user_id]
          )

          if (update) {
            req.session.user = check
            res
              .status(200)
              .json({ message: 'Successfully login', userInfo: check[0] })
          } else {
            res.status(400).json({ message: 'May mali sa pag login' })
          }
        } else {
          return res.status(200).json({
            message: 'Wrong username/password combination!',
            userInfo: check[0]
          })
        }
      })
    }
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  }
})


// GET ALL THE LIST OF FRIENDS
app.get('/getUsers/:id', async (req, res) => {
  const { id } = req.params

  const [users] = await pool.query(
    "SELECT a.user_id, a.friend_user_id, b.* FROM ( SELECT user_id, friend_user_id, status FROM tbl_friends_list  WHERE status = 'accepted'UNION SELECT friend_user_id, user_id, status FROM tbl_friends_list WHERE status = 'accepted') as a LEFT JOIN tbl_users b ON a.friend_user_id = b.user_id WHERE a.user_id = ?",
    [id]
  )
  if (users.length === 0) {
    return res.status(200).json({ message: 'No users', users: users })
  } else {
    return res
      .status(200)
      .json({ message: 'Successfully get all the users', users: users })
  }
})

// GET ALL THE FRIEND REQUEST LIST
app.get('/getFriendReq/:id', async (req, res) => {
  const { id } = req.params

  const [users] = await pool.query(
    "SELECT a.friendship_id, a.user_id, a.friend_user_id, b.* FROM ( SELECT user_id, friend_user_id, status, friendship_id FROM tbl_friends_list  WHERE status = 'pending' AND user_id != ? UNION SELECT friend_user_id, user_id, status, friendship_id FROM tbl_friends_list WHERE status = 'pending' AND user_id != ?) as a LEFT JOIN tbl_users b ON a.friend_user_id = b.user_id WHERE a.user_id = ?",
    [id, id, id]
  )
  if (users.length === 0) {
    return res.status(200).json({ message: 'No users', users: users })
  } else {
    return res
      .status(200)
      .json({ message: 'Successfully get all the users', users: users })
  }
})

// ACCEPTING FRIEND REQUEST
app.post("/acceptFriend", async(req,res) => {
  const {user_id} = req.body;

  const update = await pool.query("UPDATE tbl_friends_list SET status = 'accepted' WHERE friendship_id = ?", [user_id]);
  if(update){
    res.status(200).json({message: "accepted"});
    return;
  }else{
    res.status(400).json({message: "failed to accept"});
  }
})


// REJECTING FRIEND REQUEST
app.post("/rejectRequest", async(req,res) => {
  const {user_id} = req.body;

  const update = await pool.query("DELETE FROM tbl_friends_list WHERE friendship_id = ?", [user_id]);
  if(update){
    res.status(200).json({message: "rejected"});
    return;
  }else{
    res.status(400).json({message: "failed to reject"});
  }
})



// LOGOUT
app.post('/logout', async (req, res) => {
  const { userId } = req.body
  try {
    const update = await pool.query(
      "UPDATE tbl_users SET status = 'Offline' WHERE user_id = ?",
      [userId]
    )

    if (update) {
      req.session.destroy(err => {
        if (err) {
          console.log(err)
        } else {
          res.clearCookie('userID')
          res.status(200).json({ message: 'Logged out successfully' })
        }
      })
    } else {
      res.status(400).json({ message: 'Failed to logout' })
    }
  } catch (error) {
    console.error(error)
  }
})


// SEND A FRIEND REQUEST
app.post('/sendFriendRequest', async (req, res) => {
  const { userId, userName, sentUserId } = req.body
  try {
    const [checking1] = await pool.query(
      'SELECT * FROM tbl_users WHERE user_id = ? AND user_name = ?',
      [sentUserId, userName]
    )

    if (checking1.length === 0) {
      res.json({ message: 'That user is not exist.' })
      return
    } else {
      const [checking2] = await pool.query(
        'SELECT * FROM tbl_friends_list WHERE (user_id = ? AND friend_user_id = ?) OR (user_id = ? AND friend_user_id = ?)',
        [userId, sentUserId, sentUserId, userId]
      )

      if (checking2.length > 0) {
        res.json({ message: 'That user is already your friend.' })
        return
      } else {
        const addUser = await pool.query(
          'INSERT INTO tbl_friends_list (user_id, friend_user_id, status) VALUES (?,?,?)',
          [userId, sentUserId, 'pending']
        )

        if (addUser) {
          console.log('FRIEND REQ SENT')
          res.status(200).json({ message: 'Successfully sent' })
          return
        } else {
          console.log('FRIEND REQ SENT FAILED')
          res.status(400).json({ message: 'failed to sent' })
          return
        }
      }
    }
  } catch (error) {
    console.log(error)
  }
})


// GET THE USER DATA
app.get('/getUserData/:user_id', async (req, res) => {
  const { user_id } = req.params

  const [select] = await pool.query(
    'SELECT * FROM tbl_users WHERE user_id = ? ',
    [user_id]
  )

  if (select.length > 0) {
    res
      .status(200)
      .json({
        message: 'Successfully fetch current user info',
        user_data: select
      })
    return
  } else {
    res
      .status(200)
      .json({ message: 'failed to fetch info of the current user' })
    return
  }
})


// DELETE CONVO
app.post('/removeMessage/:messageId', async (req, res) => {
  const { messageId } = req.params

  const [deleteConvo] = await pool.query(
    "UPDATE tbl_message SET is_deleted = 'Y' WHERE message_id = ?",
    [messageId]
  )

  if (deleteConvo) {
    res.status(200).json({ message: 'Deleted successfully' })
  } else {
    s.status(400).json({ message: 'Failed to delete' })
  }
})


// DELETE A SPECIFIC MESSAGE
app.post('/deleteMessage/:messageId', async (req, res) => {
  const { messageId } = req.params

  const [deleteConvo] = await pool.query(
    'DELETE FROM tbl_message WHERE message_id = ?',
    [messageId]
  )

  if (deleteConvo) {
    res.status(200).json({ message: 'Deleted successfully' })
  } else {
    s.status(400).json({ message: 'Failed to delete' })
  }
})


// UNFRIEND THE USER 
app.post('/unfriend', async (req, res) => {
  try {
    const { user_id, friend_id } = req.body

    if (!user_id || !friend_id) {
      return res.status(400).json({ message: 'Missing user_id or friend_id' })
    }

    const [checking] = await pool.query(
      'SELECT * FROM tbl_friends_list WHERE (user_id = ? AND friend_user_id = ?) OR (user_id = ? AND friend_user_id = ?) ',
      [user_id, friend_id, friend_id, user_id]
    )

    if (checking.length > 0) {
      const unfriend = await pool.query(
        'DELETE FROM tbl_friends_list WHERE friendship_id = ?',
        [checking[0].friendship_id]
      )
      if (unfriend) {
        console.log('Unfriended successfully')
        console.log('Friendship ID:', checking[0].friendship_id)
        return res
          .status(200)
          .json({ message: 'Deleted', sample: checking[0].friendship_id })
      } else {
        console.log('Failed to unfriend')
        return res.status(500).json({ message: 'Failed to unfriend' })
      }
    } else {
      return res.status(404).json({ message: 'No friendship found' })
    }
  } catch (error) {
    console.error('Error unfriending:', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
})



app.post('/changeCover', upload.single('cover_img'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  const { filename } = req.file; // Get the filename of the uploaded image
  const { user_id } = req.body;

  try {
    const insert = await pool.query(
      'UPDATE tbl_users SET cover_img = ? WHERE user_id = ?',
      [filename, user_id]
    );

    if (insert) {
      return res.status(200).json({ message: 'Cover photo changed' });
    } else {
      return res.status(400).json({ message: 'Failed to change cover photo' });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});



// UPDATE INFORMATION
app.post('/updateInfo', async (req, res) => {
  const { user_name, first_name, last_name, bio, user_id } = req.body;

  try {
    if (!(user_name || first_name || last_name || bio)) {
      return res.status(200).json({ message: "No data provided for update" });
    }

    let updateQuery = "UPDATE tbl_users SET";
    const updateValues = [];

    if (first_name !== "") {
      updateQuery += " first_name = ?,";
      updateValues.push(first_name);
    }
    if (last_name !== "") {
      updateQuery += " last_name = ?,";
      updateValues.push(last_name);
    }
    if (user_name !== "") {
      updateQuery += " user_name = ?,";
      updateValues.push(user_name);
    }
    if (bio !== "") {
      updateQuery += " bio = ?,";
      updateValues.push(bio);
    }

    updateQuery = updateQuery.slice(0, -1);

    updateQuery += " WHERE user_id = ?";
    updateValues.push(user_id);

    const update = await pool.query(updateQuery, updateValues);

    if (update.affectedRows > 0) {
      return res.status(200).json({ message: "Updated" });
    } else {
      return res.status(200).json({ message: "Failed to update" });
    }

  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});




app.post('/changeProfile', upload.single('profile_img'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  const { filename } = req.file; // Get the filename of the uploaded image
  const { user_id } = req.body;

  try {
    const insert = await pool.query(
      'UPDATE tbl_users SET profile_img = ? WHERE user_id = ?',
      [filename, user_id]
    );

    if (insert) {
      return res.status(200).json({ message: 'Profile picture changed' });
    } else {
      return res.status(400).json({ message: 'Failed to change profile picture' });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


// CHANGE PASSWORD
app.post("/changePassword", async(req,res) => {
  const {user_id, currentPass, newPass, confirmPass} = req.body;
  const hash = await bcrypt.hash(confirmPass, 10)

  const [check] = await pool.query("SELECT * FROM tbl_users WHERE user_id = ?", [user_id]);

  if(check.length === 0){
    return console.log("no user found");
  }else{
    bcrypt.compare(currentPass, check[0].password, async (err, response) => {
      if(response){
        if(newPass === confirmPass){
          const update = await pool.query("UPDATE tbl_users SET password = ? WHERE user_id = ?", [hash, user_id]);
          if(update){
           res.status(200).json({message: "password changed"})
          }else{
            return res.status(200).json({message: "failed to update password"})
          }
        }else{
          return res.status(200).json({message: "New password and confirm password does not matched."})
        }
        
      }else{
        res.status(200).json({message: "The current password is incorrect."})
      }
    })

  }
})


app.post("/verify", async(req,res) => {
  const {email} = req.body

  const update = await pool.query("UPDATE tbl_users SET verified = 1 WHERE user_name = ?",[email]);

  if(update){
    return res.status(200).json({message: "verified"})
  }else{
    return res.status(400).json({ message: "You entered the wrong username." });
  }
})


app.post("/resetPassword", async(req,res) => {
  const {email, newPass, conPass} = req.body

  const hash = await bcrypt.hash(newPass, 10)

  const [check] = await pool.query("SELECT * FROM tbl_users WHERE user_name = ?", [email]);

  if(check.length === 0){
    return console.log("no user found");
  }else{
    const hash = await bcrypt.hash(newPass, 10)
    if(newPass === conPass){
      const updatePass = await pool.query("UPDATE tbl_users SET password = ? WHERE user_name = ?",[hash, email]);
      
      if(updatePass){
        return res.status(200).json({message: "updated password"})
      }else{
        return res.json(400).json({message: "failed to update password"});
      }
    }else{
      return res.json({message: "The new password and confirm password does not match"});
    }


  }
})




app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
