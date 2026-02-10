import { ConfigOptions, v2 } from 'cloudinary';
import { CLOUDINARY } from './constants';

export const CloudinaryProvider = {
  provide: CLOUDINARY,
  useFactory: (): ConfigOptions => {
    return v2.config({
      cloud_name: 'dob26yrc9',
      api_key: '774931418867224',
      api_secret: 'QffJzv9S6GB-5z2F5l4wmEqTIws',
    });
  },
};
