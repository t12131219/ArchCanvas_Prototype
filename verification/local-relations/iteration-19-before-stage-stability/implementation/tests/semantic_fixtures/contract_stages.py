"""Evaluation-only local residual compositions with independent damaged tails."""
import torch
from torch import nn


class TailPair(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.normalize = nn.LayerNorm(8)

    def forward(self, x):
        return self.normalize(x + self.project(x))


class TailMosaic(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = TailPair()
        self.right = TailPair()

    def forward(self, x, y):
        return self.left(x) * self.right(y)


class EscapingTail(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.normalize = nn.LayerNorm(8)
        self.other = TailPair()

    def forward(self, x):
        total = x + self.project(x)
        return self.normalize(total) + total + self.other(x)


class InterruptedTail(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.normalize = nn.LayerNorm(8)
        self.other = TailPair()

    def forward(self, x):
        total = x + self.project(x)
        return self.normalize(foreign_operation(total)) + self.other(x)


class ConditionalTail(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.normalize = nn.LayerNorm(8)
        self.other = TailPair()

    def forward(self, x, flag):
        if flag:
            result = self.normalize(x + self.project(x))
        else:
            result = x
        return result + self.other(x)


class TailChain(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = TailPair()
        self.right = TailPair()

    def forward(self, x):
        return self.right(self.left(x))
