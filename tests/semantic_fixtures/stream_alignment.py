"""Unfamiliar mixed convolution/dense streams for geometry, not role inference."""
import torch
from torch import nn


class SensorFusion(nn.Module):
    def __init__(self):
        super().__init__()
        self.stem = nn.Conv2d(1, 4, 1)
        self.filter = nn.Conv2d(4, 4, 3)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.lift = nn.Linear(3, 4)
        self.first = nn.Linear(4, 4)
        self.second = nn.Linear(4, 4)

    def image_core(self, x):
        x = self.filter(x)
        x = torch.relu(x)
        x = self.pool(x)
        return x.flatten(1)

    def vector_core(self, x):
        return self.second(self.first(x))

    def image_path(self, image):
        x = self.stem(image)
        return self.image_core(x)

    def vector_path(self, vector):
        x = self.lift(vector)
        return self.vector_core(x)

    def forward(self, image, vector):
        a = self.image_path(image)
        b = self.vector_path(vector)
        return a + b
