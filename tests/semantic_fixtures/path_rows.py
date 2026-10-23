"""Measured short serial paths alongside a wider ordinary source module."""
import torch
from torch import nn


class ForkedStem(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = nn.Conv2d(2, 4, 1)
        self.right = nn.Conv2d(2, 4, 1)

    def forward(self, x):
        return self.left(x) + self.right(x)


class SpatialPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Conv2d(4, 4, 1)
        self.second = nn.Conv2d(4, 4, 1)

    def forward(self, x):
        x = self.first(x).contiguous()
        return self.second(x).contiguous()


class DensePath(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(4, 4)
        self.second = nn.Linear(4, 4)

    def forward(self, x):
        x = self.first(x).contiguous()
        return self.second(x).contiguous()


class SpatialPipeline(nn.Module):
    def __init__(self):
        super().__init__()
        self.stem = ForkedStem()
        self.spatial = SpatialPath()
        self.dense = DensePath()

    def forward(self, x):
        x = self.spatial(self.stem(x))
        return self.dense(x)


class BranchedPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Conv2d(4, 4, 1)
        self.second = nn.Conv2d(4, 4, 1)

    def forward(self, x):
        return torch.relu(self.first(x)) + torch.tanh(self.second(x))


class BranchedPipeline(nn.Module):
    def __init__(self):
        super().__init__()
        self.stem = ForkedStem()
        self.branch = BranchedPath()

    def forward(self, x):
        return self.branch(self.stem(x))
