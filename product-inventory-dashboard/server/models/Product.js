import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
}, { timestamps: true });

export default mongoose.model('Product', schema);
