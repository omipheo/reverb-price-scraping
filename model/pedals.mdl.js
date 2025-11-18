const { Schema, model } = require('mongoose');

const PedalSchema = new Schema({
  productId: String,
  conditionUuid: String,
  title: String,
  brand: String,
  condition: {
    uuid: String,
    display_name: String,
    slug: String
  },
  price: {
    amount: Number,
    amount_cents: Number,
    currency: String,
    symbol: String,
    display: String
  },
  url: String,
  csp: {
    slug: String,
    id: String,
  },
  cp_ids: [String],
  photos: [{
    _links: {
      large_crop: {href:String},
      full: {href:String},
      small_crop: {href:String},
      thumbnail: {href:String}
    }
  }],
  priceGuide: [{
    _id: String,
    condition: String,
    amount: Number,
    listingId: String,
    createdAt: Number
  }],
  canonicalProductId: String,
  createdAt: { type: Date, default: Date.now }
});

const Pedal = model('Pedal', PedalSchema);
module.exports = Pedal;