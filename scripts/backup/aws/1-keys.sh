# Durar · Backups, part 1 of 3: the two encryption keys (AWS CloudShell, Frankfurt)
# Makes two age key pairs and shows them. Copy as the steps say, then this part deletes them here.
cd ~ && curl -sSL -o age.tgz 'https://dl.filippo.io/age/v1.2.1?for=linux/amd64' && tar xzf age.tgz && rm age.tgz
./age/age-keygen -o lativ-key.txt 2>/dev/null; ./age/age-keygen -o restore-test-key.txt 2>/dev/null
echo; echo "== 1. YOUR KEY (keep in two safe places; never in GitHub):"; cat lativ-key.txt
echo; echo "== 2. RESTORE-TEST KEY (only for GitHub's RESTORE_AGE_KEY secret):"; cat restore-test-key.txt
echo; echo "== Public keys to send Claude (safe to share):"; grep -h 'public key' lativ-key.txt restore-test-key.txt
# END OF PART 1 OF 3
