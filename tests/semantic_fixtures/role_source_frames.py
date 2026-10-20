"""Unfamiliar source wrappers; analyzed statically, never executed by audits."""
import torch
from torch import nn


def brighten(x):
    return torch.relu(x)


def unresolved(x):
    return foreign_kernel(x)


def conditional(x):
    if x.sum() > 0:
        return torch.relu(x)
    return torch.tanh(x)


class WrappedStages(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 16)
        self.act = nn.ReLU()
        self.last = nn.Linear(16, 8)

    def brighten(self, x):
        return self.act(x)

    def forward(self, x):
        return self.last(self.brighten(self.first(x)))


class UnknownStages(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 16)
        self.last = nn.Linear(16, 8)

    def forward(self, x):
        return self.last(unresolved(self.first(x)))


class ConditionalStages(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.Linear(8, 16)
        self.last = nn.Linear(16, 8)

    def forward(self, x):
        return self.last(conditional(self.first(x)))
