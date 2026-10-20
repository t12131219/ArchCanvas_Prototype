"""Allocation and language-effect boundaries for source identity."""
import torch
from torch import nn


class Unit(nn.Module):
    def __init__(self):
        super().__init__()
        self.transform = nn.Linear(8, 8)

    def forward(self, x):
        return torch.sigmoid(self.transform(x))


class ReallocatedBinding(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = Unit()
        self.old = self.first
        self.first = Unit()

    def forward(self, x, y):
        return self.first(x) + self.old(y)


class DynamicAccess(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)

    def __getattribute__(self, name):
        return external(name)

    def forward(self, x, y):
        return self.first(x) + self.first(y)


class ConstructorMethodEffect(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 8)
        self.unresolved_setup()

    def forward(self, x, y):
        return self.first(x) + self.first(y)

