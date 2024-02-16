const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.json());
app.use(cors());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', 
  database: 'chat_app',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  console.log('Connected to MySQL database');
});

app.post('/messages', (req, res) => {
  const { sender, recipient, message } = req.body;
  const sql = 'INSERT INTO tbl_message (sender_id, receiver_id, message) VALUES (?, ?, ?)';
  db.query(sql, [sender, recipient, message], (err, result) => {
    if (err) {
      console.error('Error inserting message:', err);
      res.status(500).json({ error: 'Error inserting message' });
      return;
    }
    console.log('Message inserted:', result);
    res.json({ message: 'Message sent successfully' });
  });
});



app.get('/messages/:recipientId/:senderId', (req, res) => {
    const recipientId = req.params.recipientId;
    const senderId = req.params.senderId;
    const sql = 'SELECT * FROM tbl_message WHERE (receiver_id = ? AND sender_id = ?) OR (receiver_id = ? AND sender_id = ?)';
    db.query(sql, [recipientId, senderId, senderId, recipientId], (err, results) => {
      if (err) {
        console.error('Error retrieving messages:', err);
        res.status(500).json({ error: 'Error retrieving messages' });
        return;
      }
      res.json(results);
    });
  });
  

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
