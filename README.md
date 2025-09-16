# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Running Locally

To run and test this application on your local machine, follow these steps:

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or later)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)
- [Visual Studio Code](https://code.visualstudio.com/) (recommended for debugging)

### 1. Install Dependencies

Open a terminal in the project's root directory and run the following command to install all the necessary packages:

```bash
npm install
```

### 2. Set Up Environment Variables

The application uses your SIGAA credentials and database connection details.

1.  This project includes a `.env` file.
2.  Open the `.env` file and enter all the required credentials (SIGAA, PostgreSQL, LDAP).

### 3. Run the Development Server

Once the dependencies are installed and your credentials are set, start the Next.js development server:

```bash
npm run dev
```

The application should now be running at [http://localhost:9002](http://localhost:9002).

### 4. Running in Debug Mode (with VS Code)

To run the application with a debugger attached, which allows you to set breakpoints and inspect code execution:

1.  Open the project folder in Visual Studio Code.
2.  Go to the **Run and Debug** view (you can click the icon on the left-side Activity Bar or press `Ctrl+Shift+D`).
3.  From the dropdown menu at the top, select the configuration named **"Next.js: Debug App"**.
4.  Click the green "Start Debugging" arrow (or press `F5`).

This will start the development server with the debugger attached and automatically open the application in your default browser. You can now set breakpoints in your `.ts` and `.tsx` files (including server-side code in `src/lib`) to debug the application.
