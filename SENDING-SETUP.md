# Switching on the quote form

Right now the quote form on the website collects everything, but the Send button
stops and tells the customer to call instead. This page turns sending on.

You need about 15 minutes, a computer, and the Gmail account
`russrestores24.7@gmail.com`.

Everything here is free. There is nothing to pay for and no account to create.

When you are done, a customer who fills in the form sends you:

- an email with the whole request and any photos attached
- a row added to a spreadsheet, so you have a running list you can open any time
- a copy to the customer, if they ticked the box asking for one

---

## Part 1: Make the script

**Step 1.** Sign in to Gmail as `russrestores24.7@gmail.com`. Use that account
for every step below. If you are signed in to more than one Google account, sign
out of the others first. This trips people up more than anything else here.

**Step 2.** Go to `script.google.com`.

**Step 3.** Click the blue **New project** button on the top left.

**Step 4.** A code window opens with a few lines already in it, starting with
`function myFunction()`. Click anywhere in that window, press **Ctrl+A** to
select all of it, then press **Delete**. The window should now be empty.

**Step 5.** Open the file `apps-script-receiver.gs` from the website folder.
Any text editor will open it, including Notepad. Select everything in it with
**Ctrl+A** and copy it with **Ctrl+C**.

**Step 6.** Click back into the empty code window on `script.google.com` and
paste with **Ctrl+V**.

**Step 7.** Click the **Save project** button. It is the floppy disk icon in the
row of icons above the code.

**Step 8.** At the very top left it says **Untitled project**. Click that text,
type `Cook King Quote Form`, and click **Rename**.

---

## Part 2: Let the script send email as you

The first time it runs, Google asks your permission. It looks alarming. It is
normal. You are giving your own script permission to use your own account.

**Step 9.** Above the code there is a dropdown listing function names. Click it
and choose **testEmail**.

**Step 10.** Click **Run**.

**Step 11.** A window appears saying **Authorization required**. Click
**Review permissions**.

**Step 12.** Click your account, `russrestores24.7@gmail.com`.

**Step 13.** A page appears saying **Google hasn't verified this app**. This is
expected. Google says this about every script that has not been through their
paid review process. It is your own script. Click the small **Advanced** link at
the bottom left.

**Step 14.** Click **Go to Cook King Quote Form (unsafe)**. The word unsafe is
Google's wording for any unreviewed script, including your own.

**Step 15.** Click **Allow**.

**Step 16.** Check your Gmail inbox. You should have an email with the subject
`Quote request - Test - Cook King website`. If it arrived, the script can send
mail and the hard part is over. If nothing arrives, check the spam folder.

---

## Part 3: Publish it so the website can reach it

**Step 17.** Click the blue **Deploy** button on the top right, then click
**New deployment**.

**Step 18.** On the left of the window that opens there is a gear icon next to
the words **Select type**. Click the gear, then click **Web app**.

**Step 19.** Fill the form in like this:

- **Description**: type `Quote form`
- **Execute as**: leave it on **Me (russrestores24.7@gmail.com)**
- **Who has access**: change it to **Anyone**

**Step 20.** About **Who has access: Anyone**. This one looks worse than it is,
so here is exactly what it means.

It does not give anyone access to your Gmail, your Drive, or your files. It only
means a stranger's web browser is allowed to hand this script a quote request
without signing in to Google first. That is the whole point: your customers do
not have Google accounts, and they should not need one to ask you for a price.
The script only ever does the four things written into it. If you pick anything
narrower here, the form on your website will silently stop working.

**Step 21.** Click **Deploy**.

**Step 22.** A box appears with a heading **Web app** and a long address
underneath it, starting with `https://script.google.com/macros/s/`. Click the
**Copy** button next to it. Keep it somewhere safe for the next step.

**Step 23.** Click **Done**.

---

## Part 4: Point the website at it

**Step 24.** Open the file `quote.js` from the website folder in a text editor.

**Step 25.** Near the top, inside a large comment block, is this line:

```
  var QUOTE_ENDPOINT = '';
```

**Step 26.** Paste the address between the two quote marks, so it looks like
this, with your own address in place of the short one shown here:

```
  var QUOTE_ENDPOINT = 'https://script.google.com/macros/s/AKfy.../exec';
```

Do not remove the quote marks. Do not remove the semicolon at the end.

**Step 27.** Save the file.

**Step 28.** Upload the website folder to your web host the same way you always
do. You do not need to upload `apps-script-receiver.gs` or this file. They are
instructions, not part of the site.

---

## Part 5: Prove it works

**Step 29.** Open your website, click **GET QUOTE**, and fill the form in with
your own name and phone number. Send it.

**Step 30.** You should see **Sent. Russell has your request.** on the screen,
and the email should arrive within a minute.

**Step 31.** Open Google Drive at `drive.google.com`. You should now see a
spreadsheet called **Cook King Quote Requests** with your test in it. If the
customer sent photos, there is also a folder called **Cook King Quote Photos**.
Both were made for you automatically. You do not need to set them up.

---

## If something goes wrong

**The Send button says sending is not switched on yet.**
The address in Step 26 did not save, or the old version of `quote.js` is still on
the web host. Re-upload the folder.

**The Send button says it did not go through.**
Nine times out of ten, **Who has access** in Step 19 is not set to **Anyone**.
Go back to `script.google.com`, open the project, click **Deploy**, click
**Manage deployments**, click the pencil icon, fix that setting, and click
**Deploy**.

**Nothing arrives by email.**
Check the spam folder first. Google allows this account 100 emails a day, which
is far more than a contracting business sends. If you somehow hit that, it starts
working again the next day.

**You want to check the address is alive.**
Paste the address from Step 22 into any web browser. You should see the words
`Cook King quote receiver is running.` If you see an error page instead, the
deployment is wrong and Step 19 is the place to look.

---

## If you change the script later

Editing the code is not enough on its own. Google keeps serving the old version
until you publish again. After any edit: click **Deploy**, click **Manage
deployments**, click the pencil icon, set **Version** to **New version**, then
click **Deploy**. The address stays the same, so you do not have to touch the
website again.

---

## Photos, and the limit on them

The website shrinks every photo on the customer's phone before sending it, so a
large picture becomes a small one on the way out. The form accepts up to
**4 photos** per request and tells the customer that before they pick any.

Google does not publish a size limit for data arriving at a script like this, so
the limit built into the form is a cautious guess rather than a measured one. It
has not been pushed until it broke. If a customer ever reports that sending fails
only when they attach photos, that is the first thing to suspect, and the fix is
to lower `MAX_PHOTOS` in `quote.js`.

Customers are told they can text photos to 480-414-6504 instead.

---

## Moving to something else later

Sending lives in two places in `quote.js` and nowhere else:

- `QUOTE_ENDPOINT` near the top, which is the address
- `buildPayload()`, which decides what information gets sent

A different service means changing those two and nothing else. The form, the
screens, the saved answers, and the error handling all stay as they are.
