import { Branches } from "./Branches";
import { Categories } from "./Categories";
import { Faqs } from "./Faqs";
import { Media } from "./Media";
import { OfferCategories } from "./OfferCategories";
import { Offers } from "./Offers";
import { Pages } from "./Pages";
import { Posts } from "./Posts";
import { Results } from "./Results";
import { Services } from "./Services";
import { Specialists } from "./Specialists";
import { Users } from "./Users";

// `users` first so Payload recognises it as the auth collection, then media.
export const collections = [
  Users,
  Media,
  Posts,
  Categories,
  Offers,
  OfferCategories,
  Services,
  Specialists,
  Results,
  Faqs,
  Branches,
  Pages,
];
