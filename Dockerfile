# Use official lightweight Python image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
# Cloud Run sets the PORT environment variable automatically (default 8080)
ENV PORT=8080

# Set working directory
WORKDIR /app

# Install system dependencies needed for spatial libraries (geopandas/osmnx)
RUN apt-get update && apt-get install -y \
    libspatialindex-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend application code
COPY server.py .

# Copy the Data directory containing the compressed graph
COPY Data/ Data/

# Expose the port
EXPOSE $PORT

# Command to run the application using sh to expand the PORT variable
CMD sh -c "uvicorn server:app --host 0.0.0.0 --port ${PORT}"
