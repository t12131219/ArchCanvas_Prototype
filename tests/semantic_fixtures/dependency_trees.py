"""Static-only evaluation: converging computations with independent failures."""
import math
import torch
from torch import nn


class MergeWeave(nn.Module):
    def weave(self, x, y):
        return torch.sin(torch.relu(x)) - torch.cos(torch.sigmoid(y))

    def forward(self, x, y):
        return torch.tanh(self.weave(x, y))


class ScaledProjection(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(12, 12)
        self.width = 12

    def scale(self, x):
        return self.project(x) * math.sqrt(self.width)

    def forward(self, x):
        return torch.relu(self.scale(x))


class LateTree(nn.Module):
    def weave(self, x, y, context):
        return torch.sin(x) + torch.cos(y) + context

    def forward(self, x, y, context):
        return torch.tanh(self.weave(x, y, context))


class EscapingTree(nn.Module):
    def weave(self, x, y):
        a = torch.sin(x)
        return a + torch.cos(y), a

    def forward(self, x, y):
        out, shortcut = self.weave(x, y)
        return torch.tanh(out) + shortcut


class UnknownTree(nn.Module):
    def good(self, x, y):
        return torch.sin(x) + torch.cos(y)

    def bad(self, x, y):
        return torch.sin(x) + external_unresolved(y)

    def forward(self, x, y):
        return self.good(x, y) + self.bad(x, y)


class SharedTree(nn.Module):
    def weave(self, x, y):
        shared = torch.sin(x)
        return torch.tanh(shared) + torch.cos(shared) + torch.relu(y)

    def forward(self, x, y):
        return torch.tanh(self.weave(x, y))


class ConditionalTree(nn.Module):
    def weave(self, x, y, choose):
        if choose:
            a = torch.sin(x)
        else:
            a = torch.cos(x)
        return a + torch.relu(y)

    def forward(self, x, y, choose):
        return torch.tanh(self.weave(x, y, choose))
