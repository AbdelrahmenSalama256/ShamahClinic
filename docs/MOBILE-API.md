# Mobile app API

The Shamah Flutter app (`D:\shamah_app`) talks to this Next.js app at
`https://<site>/api/mobile/<endpoint>`. Same server, same MariaDB database, same deploy as
the website and the console. There is no second backend to host.

| Piece | Where |
| --- | --- |
| Tables (`app_customers`, `app_tokens`, `app_bookings`, `app_favourites`, `app_addresses`, `app_loyalty`) | `src/lib/db/migrations/018_mobile_app.sql` |
| The route (one dispatcher for every endpoint) | `src/app/api/mobile/[...path]/route.ts` |
| Endpoint handlers | `src/lib/mobile/handlers.ts` |
| Patients, passwords, tokens | `src/lib/mobile/accounts.ts` |
| Branches/services read from the CMS lists | `src/lib/mobile/catalog.ts` |
| Console screen: **Mobile app** (bookings + patients + points) | `/console/app`, `src/components/console/AppScreen.tsx`, `src/app/api/console/app/[[...rest]]/route.ts` |
| Tests | `tests/mobile-api.test.ts` |
| phpMyAdmin update for an existing live database | `database/update-mobile-app.sql` |

## Building the app against it

```
flutter build apk --release \
  --dart-define=SHAMAH_API_BASE_URL=https://<site>/api/mobile/ \
  --dart-define=SHAMAH_API_PASSWORD=<MOBILE_API_PASSWORD from the server env>
```

`GET /api/mobile/health` (no password needed) answers
`{"data":{"database":true,"schema":true,"api_password_set":true}}` when the server is ready.

## Conventions (what the app expects)

- `api_password` travels as a field: JSON body for POST, query string for GET. Missing or
  wrong → `401 {"message":"Unauthenticated."}`.
- Signed-in calls send `Authorization: Bearer <token>`. Tokens are opaque, stored as SHA-256,
  live 180 days and slide forward on use. Logout revokes the one token; a password change
  revokes every other device; blocking a patient in the console revokes all.
- Envelope: `{success, status, message, data}`. Validation → `422` with
  `error: {field: [message]}` so the app shows the message under the field.
- Language: Arabic by default; `Accept-Language: en` or `lang=en` for English messages and names.
- Phone numbers are Egyptian mobiles, stored as `01xxxxxxxxx` (`+20…`, Arabic digits accepted).
- Passwords: 8+ characters with letters and digits (the app's own rule). bcrypt.

## Endpoints

| Endpoint | Method | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `register` | POST | — | `first_name, second_name, phone_number, password` | `token, user` |
| `login` | POST | — | `phone_number, password, mobileapp_notification_token` | `token, user` |
| `logout` | POST | ✓ | — | envelope |
| `fetch_user` | GET | ✓ | — | `user` (+ `data`) |
| `update_user` | POST | ✓ | `first_name, second_name, phone_number, password?` | `user` |
| `fetch_loyalty_program` | GET | ✓ | — | `data[]{id,type,cat,amount_spent,points,points_to_money,date_at,type_msg,cat_msg}` |
| `contactus` | POST | ✓ | `subject, content` | envelope (also a lead, source `app-contact`) |
| `booking/store` | POST | ✓ | `branch_id, product_id, start_at_date, start_at_time, end_at_date, end_at_time` | `booking_code` (also a lead, source `app-booking`) |
| `booking/list` | GET | ✓ | — | `data[]` booking records |
| `booking/show` | GET | ✓ | `booking_code` | `data` booking record |
| `booking/canceled` | POST | ✓ | `booking_code` | `data` booking record |
| `fetch_all_branches` | GET | — | — | `data[]{id,name,address,phone_number,email,open_at,close_at,latitude,longitude}` |
| `fetch_nearby_stores_branches_long_lat` | GET | — | `latitude, longitude` | same + `distance` (km), nearest first |
| `all_favourite_products` | GET | ✓ | `page` | `data{current_page,last_page,data[]{id,name,price,image_url,favourite}}` |
| `add_or_remove_favourite_product` | POST | ✓ | `product_id` | `data: 1` added / `2` removed |
| `fetch_address` | GET | ✓ | — | `data[]{id,client_name,street_name,bulding_number,floor,apartment_number,phone_number,extra_info,latitude,longitude,fav}` |
| `add_address` | POST | ✓ | the same keys (lat/long optional) | `data` the new address |

A booking record: `{id, code, booking_code, patient_id, branch_id, services_cat_id, status,
start_at, end_at, status_msg, status_color, branch{…}, invoice_item{price}, service_item{name, image_url}}`.

### IDs

- `branch_id` is the CMS branch row's id (`nasr-city`, `new-cairo`, `sheikh-zayed`) — the
  same slugs the app bundles.
- `product_id` is the app's service slug. `SERVICE_ALIASES` in `catalog.ts` maps the slugs
  that differ from the CMS (`botox` → `botox-injections`, …); unknown-to-CMS slugs fall back
  to the app's own names and starting prices.

### Booking status

| Code | Meaning | App shows |
| --- | --- | --- |
| 1 | new request | sent |
| 2 | confirmed by the clinic | sent |
| 3 | rescheduled | sent |
| 4 | visited — grants loyalty points once (price × `MOBILE_POINTS_PER_EGP`) | visited |
| 5 | no answer / not confirmed | unconfirmed |
| 6 | cancelled by the patient | cancelled |
| 7 | cancelled by the clinic | cancelled |

The clinic moves these on **Console → Mobile app**. The matching lead on the Leads screen
follows (booked / done / lost).

## Limits

Login: 8 tries per phone and 20 per IP per 15 min. Register: 10 per IP per hour. Booking:
10 per patient per hour, at most 5 open future bookings, no past dates, at most 6 months
ahead; a repeated identical request returns the same code. Favourites ≤ 200, addresses ≤ 20.
The throttles are in-memory, which is correct for the single-process deployment this app
already requires (docs/SELF-HOSTED.md).

## Environment

`MOBILE_API_PASSWORD` (required), `MOBILE_POINTS_PER_EGP` (0.1), `MOBILE_POINT_VALUE_EGP` (0.1),
`MOBILE_SIGNUP_BONUS_POINTS` (0). `NEXT_PUBLIC_SITE_URL` turns stored image paths into absolute URLs.

## Branch coordinates

The nearby read needs each branch's latitude/longitude. They are fields on the branch row
in **Console → Branches** (Latitude, Longitude, Opens at, Closes at). Until they are filled,
branches are returned with `latitude: null` and the nearby list keeps the console order.
