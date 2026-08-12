try {
    process.loadEnvFile?.();
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const { app } = await import('./app.js');

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`CF-Daily server listening on port ${port}`));
