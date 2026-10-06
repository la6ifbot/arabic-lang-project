# Durar · Backups, part 2 of 3: the private backup bucket (AWS CloudShell, Frankfurt)
B=durar-backups-$(aws sts get-caller-identity --query Account --output text); R=eu-central-1
aws s3api create-bucket --bucket "$B" --region $R --create-bucket-configuration LocationConstraint=$R >/dev/null
aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$B" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$B" --lifecycle-configuration '{"Rules":[
 {"ID":"dailies-31-days","Filter":{"Prefix":"daily/"},"Status":"Enabled","Expiration":{"Days":31},"NoncurrentVersionExpiration":{"NoncurrentDays":7}},
 {"ID":"monthlies-1-year","Filter":{"Prefix":"monthly/"},"Status":"Enabled","Expiration":{"Days":366},"NoncurrentVersionExpiration":{"NoncurrentDays":7}},
 {"ID":"tidy-up","Filter":{},"Status":"Enabled","Expiration":{"ExpiredObjectDeleteMarker":true},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":1}}]}'
aws s3api put-bucket-policy --bucket "$B" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"HttpsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$B\",\"arn:aws:s3:::$B/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
echo; echo "== BACKUP_BUCKET (for GitHub): $B"
# END OF PART 2 OF 3
