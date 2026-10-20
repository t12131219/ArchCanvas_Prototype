"""Static evaluation of exclusive tails and protected mixed compositions."""
import torch
from torch import nn


class UnaryWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)

    def forward(self, x):
        projected = self.project(x)
        branch = torch.tanh(projected)
        return self.norm(x + branch)


class ReusedWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)

    def forward(self, x):
        projected = self.project(x)
        branch = torch.tanh(projected)
        return self.norm(x + branch), branch


class InterruptedWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)
        self.known = UnaryWeave()

    def forward(self, x, y):
        branch = torch.tanh(foreign_operation(self.project(x)))
        return self.norm(x + branch) + self.known(y)


class ConditionalWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)
        self.known = UnaryWeave()

    def forward(self, x, y, flag):
        if flag:
            result = self.norm(x + torch.tanh(self.project(x)))
        else:
            result = x
        return result + self.known(y)


class ImageWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Conv2d(4, 4, 3, padding=1)
        self.act = nn.ReLU()
        self.norm = nn.BatchNorm2d(4)

    def forward(self, x):
        return self.norm(x + self.act(self.project(x)))


class StatefulWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Conv2d(4, 4, 3, padding=1)
        self.act = nn.ReLU(inplace=True)
        self.norm = nn.BatchNorm2d(4)

    def forward(self, x):
        return self.norm(x + self.act(self.project(x)))


class MultipleInputWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(8, 8)
        self.norm = nn.LayerNorm(8)

    def forward(self, x, y):
        return self.norm(x + self.project(x) * y)


class WholeBranchWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.norm = nn.LayerNorm(8)

    def forward(self, x):
        return self.norm(x + torch.tanh(x))
