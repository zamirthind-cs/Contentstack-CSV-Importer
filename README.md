# 📥 Contentstack CSV Importer – Proof of Concept

This app allows you to bulk import entries into Contentstack using a CSV file. It walks users through configuration, schema upload, field mapping, and live import tracking.
> ⚠️ **Note:** This is a proof-of-concept tool and is **not intended for production use**.

A simple CSV import interface built with:

- React
- Vite
- TypeScript
- Tailwind CSS
- [shadcn/ui](https://ui.shadcn.com/)

---

## 📚 Table of Contents

1. [Disclaimer](#️disclaimer)
2. [Getting Started](#getting-started)
3. [Import Tips, Considerations & Best Practices](#import-tips-considerations--best-practices)
4. [How to Use the CSV Importer UI](#how-to-use-the-csv-importer-ui)
   - [1. Enter Contentstack Credentials](#1-enter-your-contentstack-credentials)
   - [2. Choose Environment](#2-choose-the-correct-environment)
   - [3. Upload Content Type Schema](#3-upload-your-content-type-schema)
   - [4. Enable Auto-Publish (Optional)](#4-enable-auto-publish-optional)
   - [5. Upload CSV File](#5--upload-csv-file)
   - [6. Field Mapping](#6-field-mapping)
   - [7. Import Data](#7-import-data)



---

## Disclaimer

The code provided herein is intended solely for demonstration and proof-of-concept purposes. It is NOT intended for production use, nor should it be used in any environment or application where its failure or misbehavior could lead to direct or indirect harm, loss, or damage.

Users are strongly advised to thoroughly review, test, and, if necessary, modify the code before considering its use in any real-world or production scenario.

By using or implementing this code, you acknowledge and accept all risks associated with its use and agree to hold harmless the author(s) or provider(s) from any and all claims, damages, or liabilities.

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:

- [Node.js & npm](https://nodejs.org/) – ideally via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

### Installation

```bash
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate into the project directory
cd <YOUR_PROJECT_NAME>

# Step 3: Install dependencies
npm install

# Step 4: Start the development server
npm run dev
```

---

## Import Tips, Considerations & Best Practices

Before running a full import, keep the following in mind to avoid common pitfalls and streamline the process:

- 🧪 **Test with a small sample first**  
  This helps identify issues early (e.g., malformed data, mapping mismatches) before affecting hundreds of entries. It's much easier to fix or clean up a handful of entries than deal with bulk corrections.

- ✅ **Validate field formats before import**  
  Ensure that your CSV values match the expected data types in Contentstack:
  - **Date fields** should be in an acceptable ISO format (e.g., `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`).
  - **Number fields** must contain numeric values only (no extra characters or symbols).
  - Other strict field types (e.g., boolean, reference) may also require specific formatting.
  - Incorrect types may cause the row to be skipped or the entry to be rejected during import.

- 🔁 **Use automation for cleanup when needed**  
  If large-scale cleanup is necessary, consider using the [Contentstack Management API](https://www.contentstack.com/docs/developers/apis/content-management-api/) to script deletions or rollbacks. Manual deletion is inefficient at scale.

- 🔗 **Ensure referenced content types already exist**  
  All referenced content types (used in reference or global fields) must already be present in your stack before import. Otherwise, those fields will fail to resolve.

- 🧩 **Expect edge cases with modular blocks and deeply nested fields**  
  While this tool supports most typical schemas, complex nesting (especially with modular blocks or JSON structures) may not map perfectly and could require post-import adjustments.

- 🧪 **Always test in a non-production environment first**  
  This avoids data loss or content corruption in your live environments and gives you flexibility to iterate safely.

- 💡 **Valuable Insight**:  
  For modular content models with nesting or reusable global fields, consider doing a dry run using a trimmed-down schema and CSV that only targets simpler fields. Once successful, incrementally expand to include more complex fields. This layered approach helps isolate problem areas and speeds up validation.

---

# How to Use the CSV Importer UI
![Import Setup](/public/Import-Setup.png)
Follow these steps to configure and execute your import successfully:

---

## 1. Enter Your Contentstack Credentials

- **API Key**: Found in your stack settings under "API Keys."
- **Management Token**: Required to create or update entries. Make sure it has sufficient permissions.
- **API Host**: Select the region corresponding to your stack (e.g., US or EU).

---

## 2. Choose the Correct Environment

- Enter the name of the environment (e.g., `development`, `staging`, or `production`) where the entries will be created.
- ✅ *Be sure to match the environment name exactly as defined in Contentstack.*

---

## 3. Upload Your Content Type Schema

- Upload the **JSON schema** for the content type you’re importing into.
- This file is typically exported from Contentstack:
  - Navigate to **[Content Models → Export](https://www.contentstack.com/docs/developers/create-content-types/export-a-content-type)**.
- The importer will auto-fill the **Content Type UID** based on the schema file name.

---

## 4. Enable Auto-Publish (Optional)

- Toggle **Auto-publish entries** if you want entries to be published immediately after creation.
- If left off, entries will be created in **draft** state and must be published manually later.

---

## 5. Upload CSV File
![CSV Upload](/public/CSV-Upload.png)
Upload the CSV file that contains the data you want to import into Contentstack.

### 📌 Best Practices for CSV Formatting

- ✅ **Use headers in the first row**  
  The first row of your CSV must contain column headers. These headers are used to map data to corresponding fields in your content type.

- 🧠 **Match column names to field UIDs**  
  For best results, the column headers should **exactly match the UID of the fields** in your Contentstack content type schema.  
  - Example: If your content type has a text field with UID `author`, your CSV column should also be named `author` — not `authors`, `name`, or `writer`.

- 🧹 **Clean your CSV**  
  Remove any columns that you don’t intend to map or import. This helps reduce confusion and avoids unintended data issues during the field mapping step.
 For user readability it is also easier to reorganize the columns to match the order they would appear in the fields of the content type.

- 📎 **Supported format**: CSV with comma-separated values (`.csv` extension)

### What Happens Next?

Once your CSV is uploaded, the importer will allow you to map each column to its corresponding field in your content type schema. If column headers don’t match any UIDs, you’ll need to manually map them in the next step.

---

## 6: Field Mapping
![Field Mapping](/public/Field-Mapping.png)

In this step, you'll map the columns from your CSV file to the fields defined in your uploaded Contentstack content type schema.

### 🔄 Auto-Mapping by Header Titles

- The app will **automatically attempt to match CSV columns** to Contentstack fields based on header names.
- For best results, make sure your CSV column names match the **UIDs** of your fields (e.g. `title`, `state_name`, `coordinates`).

### 🛠 Manual Adjustments

- If a column does **not match any field**, the app will default to **“Skip this column”**.
- You can also choose to **manually skip fields** if:
  - The data isn't needed
  - You plan to enter that data later in Contentstack

### 🔁 Nested Fields & Modular Blocks

- Fields that exist within **modular blocks** or **global fields** will be shown using their full path (e.g. `data.coordinates.lng`).
- You can map to these nested fields just like standard ones, but keep in mind that complex nesting may require additional post-import validation.

---

✅ Once you've completed your field mappings, you can proceed to import your data.


## 7: Import Data
![Start Import](/public/Start-Import.png)

Once all mappings are confirmed, start the import process. The app will process your CSV **row by row**, and for each row, it will attempt one of the following:

- ✅ **Create** a new entry (if it doesn’t exist in Contentstack)
- ♻️ **Update** an existing entry (if the entry exists and contains new data)
- ⏭️ **Skip** the row (if the entry already exists and no new data is provided)

### 🧾 Real-Time Import Status
![Import Updates](/public/Import-Updates.png)
- View the total rows, mapped fields, and progress percentage.
- Status indicators include:
  - `Success`
  - `Error`
  - `Skipped`
  - `Created`, `Updated`, or `Published` depending on entry state and your auto-publish setting

---

### 📋 Import Logs
![Import Logs](/public/Import-Logs.png)
- Detailed logs are captured for every row processed.
- You’ll see:
  - The action taken (create, update, skip)
  - Any skipped conditions (e.g. no new data)
  - The UID of the entry if applicable
- Logs are secure – API keys and sensitive data are automatically redacted.

You can:
- 🔄 **Refresh** to update logs during import
- 📥 **Download** a full log file
- 🧹 **Clear** the log panel to reset visibility

---

### 🔍 Verifying Entries

- Once import is complete, you can go to your **Entries** section in Contentstack to verify successful creation or updates.
- Use the logged UID to quickly locate specific entries.

---


