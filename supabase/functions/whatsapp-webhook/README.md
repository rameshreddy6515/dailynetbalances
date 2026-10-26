# whatsapp-webhook Edge Function

Record daily closings by messaging a WhatsApp number — powered by the Meta
WhatsApp Business **Cloud API** (free tier, no WhatsApp Business app install
needed for the test number).

## Message grammar

```
list                        → merchant names
status                      → today's per-merchant change + total
sharma 15230                → save today's closing for Sharma
sharma 15230 b2000          → closing + Move to Bank
sharma 15230 b2000 m150     → closing + bank + misc expense
```

Opening is carried from the previous closing (same as the app). A second
message for the same merchant/day updates the entry instead of duplicating.
Entries are tagged `whatsapp`.

## Setup (~20 min, one time)

1. **Meta app**: [developers.facebook.com](https://developers.facebook.com) →
   My Apps → Create App → type **Business** → add the **WhatsApp** product.
2. In WhatsApp → **API Setup**, Meta gives you:
   - a **test phone number** + its `Phone number ID`
   - a temporary `WHATSAPP_TOKEN` (24 h — for production, create a System User
     token: Business Settings → System Users → Add Assets → WhatsApp)
3. **Add your own WhatsApp number** as a test recipient on the same page
   (receive OTP → verify). The test number can only message approved
   recipients, and only they can trigger the bot.
4. **Deploy & secrets**:

   ```bash
   supabase functions deploy whatsapp-webhook --no-verify-jwt
   supabase secrets set \
     WHATSAPP_VERIFY_TOKEN=<any-random-string> \
     WHATSAPP_TOKEN=<token-from-step-2> \
     WHATSAPP_PHONE_NUMBER_ID=<phone-number-id> \
     WHATSAPP_ALLOWED_NUMBERS=91XXXXXXXXXX
   ```

   `WHATSAPP_ALLOWED_NUMBERS` is the country-code + number with no `+`
   (comma-separated for several phones). Anyone not on the list gets
   "not allowed" and cannot write data.
5. **Register the webhook**: WhatsApp → **Configuration** → Edit webhook:
   - Callback URL: `https://<PROJECT_REF>.supabase.co/functions/v1/whatsapp-webhook`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN` you set
   - Subscribe to the **`messages`** webhook field.
6. Message the test number `help` from your verified phone → you should get
   the command list back.

## Notes

- Entries appear in the app tagged `whatsapp`; "Today's change" in the reply
  uses the same formula as the dashboard.
- Temporary tokens expire in 24 h — create a permanent System User token
  before relying on it daily.
- Keep `WHATSAPP_TOKEN` secret; anyone with it can send messages as your
  business number.
