# How to start the backend (NestJS)

1. Make sure PostgreSQL is running and the database in your DATABASE_URL exists.
2. In a terminal, go to the backend directory:
   cd backend
3. Install dependencies (if not done):
   npm install
4. Generate the Prisma client:
   npx prisma generate
5. Run migrations (if you have migrations):
   npx prisma migrate deploy
6. Start the backend in development mode:
   npm run start:dev

The backend will be available at http://localhost:3000 by default.
