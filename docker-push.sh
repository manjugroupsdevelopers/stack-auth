#!/bin/bash
set -e

IMAGE="manjugroups/stackauth"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE}:${TAG}"
docker build -f docker/server/Dockerfile -t "${IMAGE}:${TAG}" .

echo "Pushing ${IMAGE}:${TAG} to Docker Hub..."
docker push "${IMAGE}:${TAG}"

echo "Done! Image pushed: ${IMAGE}:${TAG}"
