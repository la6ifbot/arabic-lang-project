# Durar · Backups, part 3 of 3: two access keys (AWS CloudShell, Frankfurt)
# durar-backup-uploader may only ADD backups. durar-backup-restore-test may only READ the dailies.
B=durar-backups-$(aws sts get-caller-identity --query Account --output text)
aws iam create-user --user-name durar-backup-uploader >/dev/null
aws iam put-user-policy --user-name durar-backup-uploader --policy-name DurarBackupUploadOnly --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:PutObject\",\"Resource\":[\"arn:aws:s3:::$B/daily/*\",\"arn:aws:s3:::$B/monthly/*\"]}]}"
aws iam create-user --user-name durar-backup-restore-test >/dev/null
aws iam put-user-policy --user-name durar-backup-restore-test --policy-name DurarBackupReadDailies --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::$B\",\"Condition\":{\"StringLike\":{\"s3:prefix\":\"daily/*\"}}},{\"Effect\":\"Allow\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$B/daily/*\"}]}"
echo; echo "== BACKUP_AWS_ACCESS_KEY_ID and BACKUP_AWS_SECRET_ACCESS_KEY (uploader):"
aws iam create-access-key --user-name durar-backup-uploader --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text
echo; echo "== RESTORE_AWS_ACCESS_KEY_ID and RESTORE_AWS_SECRET_ACCESS_KEY (restore test):"
aws iam create-access-key --user-name durar-backup-restore-test --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text
# END OF PART 3 OF 3
