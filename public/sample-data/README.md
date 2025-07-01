# Sample Data for Contentstack CSV Importer

This folder contains sample CSV files that you can use to test the Contentstack CSV Importer functionality.

## Available Sample Files

### 1. users.csv
Contains sample user data with the following fields:
- name
- email
- user_type (Admin, Editor, Viewer)
- department
- location
- phone
- status (Active, Inactive)

### 2. products.csv
Contains sample product data with the following fields:
- title
- description
- price
- category
- sku
- stock_quantity
- featured (boolean)
- tags

### 3. blog-posts.csv
Contains sample blog post data with the following fields:
- title
- content
- author
- category
- published_date
- featured_image (URLs)
- tags
- status (Published, Draft)

## How to Use

1. Download any of the CSV files from this folder
2. Go to the CSV Import tool
3. Upload the downloaded CSV file
4. Map the fields according to your Contentstack content type schema
5. Run the import to test the functionality

## Notes

- All sample data is fictional and created for testing purposes only
- Image URLs in the blog-posts.csv file are from Unsplash (free stock photos)
- Make sure your Contentstack content type schema matches the fields you want to import
- You can modify these files to match your specific content type structure