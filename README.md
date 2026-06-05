# Path Review Install Test

This is a tiny Windows executable test for the pathologist review app.

It checks whether a no-admin local app can:

1. Start on a locked-down Windows computer
2. Open a browser page at localhost
3. Save a small test file to the user's Documents folder

## What it does

When run, it creates:

```text
Documents/PathReviewTest/
```

And writes

```text
test_save.json
review_test.json
```
