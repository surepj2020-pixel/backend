
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const WhatsAppRoute = require('./models/WhatsAppRoute');

async function checkDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find();
        const routes = await WhatsAppRoute.find();
        console.log('---START---');
        console.log('USERS:', JSON.stringify(users, null, 2));
        console.log('ROUTES:', JSON.stringify(routes, null, 2));
        console.log('---END---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkDB();
