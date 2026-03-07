require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const ADMIN_WEB = path.join(__dirname, '../admin_web_page');

const app = express();

app.use(cors());
app.use(express.json());

// Serve admin web page as static files
app.use(express.static(ADMIN_WEB));

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

connectDB();

// Root → admin login page
app.get('/', (req, res) => res.redirect('/login.html'));

const callRoutes = require('./routes/callRoutes');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');

app.use('/api/calls', callRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/whatsapp', whatsappRoutes);

const PORT = process.env.PORT || 5000;


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});