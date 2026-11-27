-- Sign-ups now need a verified email when SMTP is configured. Everyone who already has an account was let in without that check, so they count as verified and are not locked out.
UPDATE `user` SET `emailVerified` = 1 WHERE `emailVerified` = 0;
